"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { questionLogLabel, questionRef } from "@/lib/questions/labels";
import { isUuid } from "@/lib/ids";
import type { FormState } from "@/lib/forms";
import { lockHandbookOrder } from "@/lib/handbook/structure";

// A chapter's page order holds content pages and questions. Pages are created and deleted in
// pages/actions.ts; this file adds and removes questions and moves any item.

export type OrderActionState = FormState;

const MAX_ADD = 50;
const ORDER_CHANGED = "The page order changed while you were working. Check the latest order and try again.";
const CHAPTER_GONE = "This chapter no longer exists.";

export async function addQuestionsToChapter(chapterId: string, questionIds: string[]): Promise<OrderActionState> {
  const session = await requireRole(["superadmin"]);

  if (!isUuid(chapterId)) return { error: CHAPTER_GONE };
  if (!Array.isArray(questionIds) || questionIds.length === 0) return { error: "Choose at least one question." };
  if (questionIds.length > MAX_ADD) return { error: `Add up to ${MAX_ADD} questions at a time.` };
  if (!questionIds.every(isUuid)) return { error: "One of these questions no longer exists. Reload the page." };
  const ids = [...new Set(questionIds.map((id) => id.toLowerCase()))];

  const result = await withTransaction<OrderActionState>(async (client) => {
    await lockHandbookOrder(client);
    const { rows: chapter } = await client.query<{ title: string }>(`select title from chapters where id = $1 for share`, [chapterId]);
    if (!chapter[0]) return { error: CHAPTER_GONE };

    // Locked so a question can't be moved to another chapter or deleted while it's being added.
    const { rows: found } = await client.query<{ id: string; ref_no: number; stem_text: string; chapter_id: string; placed: boolean }>(
      `select q.id, q.ref_no, q.stem_text, q.chapter_id,
              exists (select 1 from handbook_items i where i.question_id = q.id) as placed
       from questions q where q.id = any($1::uuid[])
       order by q.ref_no
       for share of q`,
      [ids]
    );
    if (found.length !== ids.length) return { error: "One of these questions no longer exists. Reload the page." };
    for (const question of found) {
      if (question.placed) return { error: `${questionRef(question.ref_no)} is already in the Handbook. Reload the page.` };
      if (question.chapter_id !== chapterId) {
        return { error: `${questionRef(question.ref_no)} belongs to another chapter. Move it to this chapter in its editor first.` };
      }
    }

    const { rows: last } = await client.query<{ max: number }>(
      `select coalesce(max(position), 0)::int as max from handbook_items where chapter_id = $1`,
      [chapterId]
    );
    let position = last[0].max;
    for (const question of found) {
      position += 1;
      await client.query(`insert into handbook_items (chapter_id, position, question_id) values ($1, $2, $3)`, [
        chapterId,
        position,
        question.id,
      ]);
      await logActivity(
        client,
        session,
        "question.added_to_handbook",
        { type: "question", id: question.id, label: questionLogLabel(question.ref_no, question.stem_text) },
        { chapter: chapter[0].title, position: `Position ${position}` }
      );
    }
    return { success: true };
  });

  revalidateOrder();
  return result;
}

// Takes a question out of the book. The question itself stays in the bank.
async function removeQuestionFromChapter(questionId: string): Promise<OrderActionState> {
  const session = await requireRole(["superadmin"]);
  if (!isUuid(questionId)) return { error: "This question is no longer in the chapter. Reload the page." };

  const result = await withTransaction<OrderActionState>(async (client) => {
    await lockHandbookOrder(client);
    const { rows } = await client.query<{ chapter_id: string; position: number; ref_no: number; stem_text: string; chapter: string }>(
      `delete from handbook_items i using questions q, chapters c
       where i.question_id = $1 and q.id = i.question_id and c.id = i.chapter_id
       returning i.chapter_id, i.position, q.ref_no, q.stem_text, c.title as chapter`,
      [questionId]
    );
    const removed = rows[0];
    if (!removed) return { error: "This question is no longer in the chapter. Reload the page." };
    await client.query(`update handbook_items set position = position - 1 where chapter_id = $1 and position > $2`, [
      removed.chapter_id,
      removed.position,
    ]);
    await logActivity(
      client,
      session,
      "question.removed_from_handbook",
      { type: "question", id: questionId, label: questionLogLabel(removed.ref_no, removed.stem_text) },
      { chapter: removed.chapter }
    );
    return { success: true };
  });

  revalidateOrder();
  return result;
}

export async function removeQuestionForm(_prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  return removeQuestionFromChapter(String(formData.get("questionId") ?? ""));
}

// Moves one page or question to a new place in its chapter. `from` is where the admin saw it,
// so a move based on an out-of-date list is refused instead of landing in the wrong place.
export async function moveHandbookItem(itemId: string, from: number, to: number): Promise<OrderActionState> {
  const session = await requireRole(["superadmin"]);
  if (!isUuid(itemId) || !Number.isInteger(from) || !Number.isInteger(to)) return { error: ORDER_CHANGED };

  const result = await withTransaction<OrderActionState>(async (client) => {
    await lockHandbookOrder(client);
    const { rows } = await client.query<{
      chapter_id: string;
      position: number;
      content_page_id: string | null;
      question_id: string | null;
      page_title: string | null;
      ref_no: number | null;
      stem_text: string | null;
      count: number;
    }>(
      `select i.chapter_id, i.position, i.content_page_id, i.question_id, p.title as page_title, q.ref_no, q.stem_text,
              (select count(*)::int from handbook_items x where x.chapter_id = i.chapter_id) as count
       from handbook_items i
       left join content_pages p on p.id = i.content_page_id
       left join questions q on q.id = i.question_id
       where i.id = $1`,
      [itemId]
    );
    const item = rows[0];
    if (!item || item.position !== from || to < 1 || to > item.count) return { error: ORDER_CHANGED };
    if (to === from) return { success: true };

    if (to < from) {
      await client.query(
        `update handbook_items set position = position + 1 where chapter_id = $1 and position >= $2 and position < $3`,
        [item.chapter_id, to, from]
      );
    } else {
      await client.query(
        `update handbook_items set position = position - 1 where chapter_id = $1 and position > $2 and position <= $3`,
        [item.chapter_id, from, to]
      );
    }
    await client.query(`update handbook_items set position = $2 where id = $1`, [itemId, to]);

    const details = { from: `Position ${from}`, to: `Position ${to}` };
    if (item.content_page_id) {
      await logActivity(client, session, "content_page.reordered", { type: "page", id: item.content_page_id, label: item.page_title ?? "" }, details);
    } else {
      await logActivity(
        client,
        session,
        "question.reordered",
        { type: "question", id: item.question_id, label: questionLogLabel(item.ref_no ?? 0, item.stem_text ?? "") },
        details
      );
    }
    return { success: true };
  });

  revalidateOrder();
  return result;
}

function revalidateOrder() {
  revalidatePath("/admin/handbook", "layout");
  revalidatePath("/admin/questions");
}
