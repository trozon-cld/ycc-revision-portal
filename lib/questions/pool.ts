import { randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import { chapterLabel, numberedChapters } from "@/lib/handbook/structure";
import { availableQuestionTypes } from "./registry";
import { isQuestionType, type QuestionType } from "./types";
import { parseQuestion, type ParsedQuestion } from "./validate";

// The questions a candidate's current test type offers to Practice or the Mock test, shared by both.

type Db = Pick<PoolClient, "query">;

export type PoolUse = "practice" | "mock";
export type PoolQuestion = { id: string; chapterId: string; type: QuestionType };
export type LoadedQuestion = ParsedQuestion & { chapterId: string; chapterLabel: string };

// Pool rule: published question, switched on for that use, in a published chapter of the test type.
const USE_COLUMN: Record<PoolUse, string> = { practice: "q.in_practice", mock: "q.in_mock" };
export const inPool = (use: PoolUse, testTypeParam: string) => `q.status = 'published' and ${USE_COLUMN[use]}
  and exists (select 1 from chapters ch join test_type_chapters cc on cc.chapter_id = ch.id
              where ch.id = q.chapter_id and ch.status = 'published' and cc.test_type_id = ${testTypeParam})`;

// Unpredictable randomness for drawing questions.
export const drawRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

export async function currentTestType(db: Db, userId: string): Promise<{ id: string; name: string } | null> {
  const { rows } = await db.query<{ id: string; name: string }>(
    `select c.id, c.name from users u join test_types c on c.id = u.current_test_type_id where u.id = $1 and u.role = 'candidate'`,
    [userId]
  );
  return rows[0] ?? null;
}

export async function loadPool(db: Db, use: PoolUse, testTypeId: string): Promise<PoolQuestion[]> {
  const { rows } = await db.query<{ id: string; chapter_id: string; type: string }>(
    `select q.id, q.chapter_id, q.type from questions q where ${inPool(use, "$1")}`,
    [testTypeId]
  );
  const built = new Set<string>(availableQuestionTypes());
  return rows.filter((row) => built.has(row.type) && isQuestionType(row.type)).map((row) => ({ id: row.id, chapterId: row.chapter_id, type: row.type as QuestionType }));
}

type QuestionRow = {
  id: string;
  chapter_id: string;
  chapter_title: string;
  chapter_number: number | null;
  type: string;
  stem_text: string;
  stem_media_id: string | null;
  stem_media_size: string | null;
  stem_media_align: string | null;
  content: unknown;
  answer: unknown;
  explanation: string | null;
};

// Questions by id, parsed, with chapters numbered in that test type's book. With `use`, only those still in
// that pool; ids that don't qualify are simply missing.
export async function loadQuestions(db: Db, ids: string[], book: { testTypeId: string; use?: PoolUse }): Promise<Map<string, LoadedQuestion>> {
  if (ids.length === 0) return new Map();
  const { rows } = await db.query<QuestionRow>(
    `with ${numberedChapters("$2")}
     select q.id, q.chapter_id, n.title as chapter_title, n.number as chapter_number, q.type, q.stem_text, q.stem_media_id,
            q.stem_media_size, q.stem_media_align, q.content, q.answer, q.explanation
     from questions q join numbered n on n.id = q.chapter_id
     where q.id = any($1::uuid[])${book.use ? ` and ${inPool(book.use, "$2")}` : ""}`,
    [ids, book.testTypeId]
  );
  const map = new Map<string, LoadedQuestion>();
  for (const row of rows) {
    const parsed = parseQuestion({
      type: row.type,
      stemText: row.stem_text,
      stemMediaId: row.stem_media_id,
      stemMediaSize: row.stem_media_size,
      stemMediaAlign: row.stem_media_align,
      content: row.content,
      answer: row.answer,
      explanation: row.explanation,
    });
    if (parsed.ok) map.set(row.id, { ...parsed.question, chapterId: row.chapter_id, chapterLabel: chapterLabel({ number: row.chapter_number, title: row.chapter_title }) });
  }
  return map;
}
