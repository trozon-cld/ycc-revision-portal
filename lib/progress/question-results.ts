import type { PoolClient } from "pg";

// Per candidate, category and question; Handbook and Practice keep separate counts. Not activity-log data.

export type ResultKey = { userId: string; categoryId: string; questionId: string };
export type ResultOutcome = { source: "handbook"; kind: "check"; correct: boolean } | { source: "handbook"; kind: "reveal" };

const MAX_COUNT = 32767;

export async function recordQuestionResult(db: Pick<PoolClient, "query">, key: ResultKey, outcome: ResultOutcome): Promise<void> {
  const ids = [key.userId, key.categoryId, key.questionId];
  if (outcome.kind === "reveal") {
    await db.query(
      `insert into question_results (user_id, category_id, question_id, handbook_reveals, handbook_first_right, handbook_at)
       values ($1, $2, $3, 1, false, now())
       on conflict (user_id, category_id, question_id) do update
         set handbook_reveals = least(question_results.handbook_reveals::int + 1, ${MAX_COUNT}),
             handbook_first_right = coalesce(question_results.handbook_first_right, false),
             handbook_at = excluded.handbook_at`,
      ids
    );
    return;
  }
  await db.query(
    `insert into question_results (user_id, category_id, question_id, handbook_tries, handbook_right,
                                   handbook_first_right, handbook_last_right, handbook_at)
     values ($1, $2, $3, 1, $4::int, $5, $5, now())
     on conflict (user_id, category_id, question_id) do update
       set handbook_tries = least(question_results.handbook_tries::int + 1, ${MAX_COUNT}),
           handbook_right = least(question_results.handbook_right::int + excluded.handbook_right,
                                  least(question_results.handbook_tries::int + 1, ${MAX_COUNT})),
           handbook_first_right = coalesce(question_results.handbook_first_right, excluded.handbook_first_right),
           handbook_last_right = excluded.handbook_last_right,
           handbook_at = excluded.handbook_at`,
    [...ids, outcome.correct ? 1 : 0, outcome.correct]
  );
}
