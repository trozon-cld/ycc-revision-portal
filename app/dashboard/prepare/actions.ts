"use server";

import { requireRole } from "@/lib/auth/guard";
import { TEXT_SIZES, type HandbookOutcome } from "@/lib/content/book";
import { pool } from "@/lib/db/pool";
import { DONE_BATCH_LIMIT, markPagesDone, recordHandbookQuestion } from "@/lib/progress/handbook";
import { isUuid } from "@/lib/ids";

// Candidate progress and settings, not activity-log actions (agreed 28 Sep).

// Kept only for a page in the candidate's current book, under that category.
export async function saveReadingPosition(itemId: string): Promise<void> {
  const session = await requireRole(["candidate"]);
  if (typeof itemId !== "string" || !isUuid(itemId)) return;
  await pool.query(
    `insert into handbook_progress (user_id, category_id, item_id, updated_at)
     select u.id, u.current_category_id, i.id, now()
     from users u
     join handbook_items i on i.id = $2
     join chapters ch on ch.id = i.chapter_id and ch.status = 'published'
     join category_chapters cc on cc.chapter_id = ch.id and cc.category_id = u.current_category_id
     left join content_pages p on p.id = i.content_page_id
     left join questions q on q.id = i.question_id
     where u.id = $1 and u.role = 'candidate' and coalesce(p.status, q.status) = 'published'
     on conflict (user_id, category_id) do update set item_id = excluded.item_id, updated_at = excluded.updated_at`,
    [session.sub, itemId]
  );
}

export async function saveTextSize(size: number): Promise<void> {
  const session = await requireRole(["candidate"]);
  if (!TEXT_SIZES.some((value) => value === size)) return;
  await pool.query(`update users set reader_text_size = $2 where id = $1 and role = 'candidate'`, [session.sub, size]);
}

// Content pages seen to the end (sent in small batches).
export async function saveHandbookPagesDone(itemIds: string[]): Promise<void> {
  const session = await requireRole(["candidate"]);
  if (!Array.isArray(itemIds) || itemIds.length > DONE_BATCH_LIMIT) return;
  const ids = [...new Set(itemIds.filter((id): id is string => typeof id === "string" && isUuid(id)))];
  await markPagesDone(session.sub, ids);
}

// Check answer or Reveal answer on a Handbook question.
export async function saveHandbookAnswer(itemId: string, outcome: HandbookOutcome): Promise<void> {
  const session = await requireRole(["candidate"]);
  if (typeof itemId !== "string" || !isUuid(itemId) || typeof outcome !== "object" || outcome === null) return;
  if (outcome.kind === "reveal") await recordHandbookQuestion(session.sub, itemId, { kind: "reveal" });
  else if (outcome.kind === "check") await recordHandbookQuestion(session.sub, itemId, { kind: "check", response: outcome.response });
}
