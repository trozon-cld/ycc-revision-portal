import type { PoolClient } from "pg";
import type { HandbookOutcome } from "@/lib/content/book";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { checkAnswer, isOversizedResponse } from "@/lib/questions/check";
import type { QuestionType } from "@/lib/questions/types";
import { recordQuestionResult } from "./question-results";

// Candidate progress in the Handbook of their current category. Not activity-log data (agreed 1 Oct).

// Most items a browser may report in one save; one view shows at most two pages.
export const DONE_BATCH_LIMIT = 100;
// A response is a few ids or a point; anything bigger isn't a real answer.

// Adds items to the chapter rows, keeping only ids still in that chapter. Unchanged rows aren't rewritten.
async function addDone(
  db: Pick<PoolClient, "query">,
  userId: string,
  categoryId: string,
  rows: { chapterId: string; itemIds: string[] }[]
) {
  if (rows.length === 0) return;
  await db.query(
    `insert into handbook_chapter_progress (user_id, category_id, chapter_id, done_items, updated_at)
     select $1, $2, r.chapter_id, r.item_ids, now()
     from jsonb_to_recordset($3::jsonb) as r (chapter_id uuid, item_ids uuid[])
     on conflict (user_id, category_id, chapter_id) do update
       set done_items = array(
             select distinct x from unnest(handbook_chapter_progress.done_items || excluded.done_items) as x
             where exists (select 1 from handbook_items i where i.id = x and i.chapter_id = excluded.chapter_id)
           ),
           updated_at = excluded.updated_at
       where not (excluded.done_items <@ handbook_chapter_progress.done_items)`,
    [userId, categoryId, JSON.stringify(rows.map((row) => ({ chapter_id: row.chapterId, item_ids: row.itemIds })))]
  );
}

// Content pages the candidate has seen to the end. Anything not a published page of their current book
// is ignored.
export async function markPagesDone(userId: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const { rows } = await pool.query<{ category_id: string; chapter_id: string; item_ids: string[] }>(
    `select u.current_category_id as category_id, i.chapter_id, array_agg(i.id) as item_ids
     from users u
     join handbook_items i on i.id = any($2::uuid[])
     join chapters ch on ch.id = i.chapter_id and ch.status = 'published'
     join category_chapters cc on cc.chapter_id = ch.id and cc.category_id = u.current_category_id
     join content_pages p on p.id = i.content_page_id and p.status = 'published'
     where u.id = $1 and u.role = 'candidate'
     group by u.current_category_id, i.chapter_id`,
    [userId, itemIds]
  );
  if (rows.length === 0) return;
  await addDone(
    pool,
    userId,
    rows[0].category_id,
    rows.map((row) => ({ chapterId: row.chapter_id, itemIds: row.item_ids }))
  );
}

// A Handbook question checked or revealed. The answer is marked here, never trusted from the browser.
export async function recordHandbookQuestion(userId: string, itemId: string, outcome: HandbookOutcome): Promise<void> {
  if (outcome.kind === "check" && isOversizedResponse(outcome.response)) return;
  const { rows } = await pool.query<{
    category_id: string;
    chapter_id: string;
    question_id: string;
    type: QuestionType;
    content: unknown;
    answer: unknown;
  }>(
    `select u.current_category_id as category_id, i.chapter_id, q.id as question_id, q.type, q.content, q.answer
     from users u
     join handbook_items i on i.id = $2
     join chapters ch on ch.id = i.chapter_id and ch.status = 'published'
     join category_chapters cc on cc.chapter_id = ch.id and cc.category_id = u.current_category_id
     join questions q on q.id = i.question_id and q.status = 'published'
     where u.id = $1 and u.role = 'candidate'`,
    [userId, itemId]
  );
  const row = rows[0];
  if (!row) return;

  let correct: boolean | null = null;
  if (outcome.kind === "check") {
    const result = checkAnswer(row, outcome.response);
    if (!result?.answered) return;
    correct = result.correct;
  }

  await withTransaction(async (client) => {
    await recordQuestionResult(
      client,
      { userId, categoryId: row.category_id, questionId: row.question_id },
      correct === null ? { source: "handbook", kind: "reveal" } : { source: "handbook", kind: "check", correct }
    );
    await addDone(client, userId, row.category_id, [{ chapterId: row.chapter_id, itemIds: [itemId] }]);
  });
}
