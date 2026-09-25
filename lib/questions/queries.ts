import type { PoolClient } from "pg";
import { pool } from "@/lib/db/pool";
import { chapterNumber, sectionLetter } from "@/lib/handbook/structure";
import { parseQuestionRef } from "./labels";
import type { QuestionStatus, QuestionType, StoredQuestion } from "./types";

// Server-only reads for the question bank.

export const BANK_PAGE_SIZE = 50;

export type BankFilters = {
  search: string;
  sectionId: string | null;
  chapterId: string | null;
  type: QuestionType | null;
  status: QuestionStatus | null;
  page: number;
};

export type BankRow = {
  id: string;
  refNo: number;
  type: QuestionType;
  status: QuestionStatus;
  stemText: string;
  hasPicture: boolean;
  chapterLabel: string;
  // Chapter number of the Handbook page order this question is placed in, if any.
  bookChapter: string | null;
};

export type ChapterOption = { id: string; label: string };
export type SectionOptions = { id: string; label: string; chapters: ChapterOption[] };

const NUMBERED_CHAPTERS = `
  numbered as (
    select c.id, c.title, c.section_id, s.position as section_position, c.position,
           row_number() over (order by s.position, c.position)::int as number
    from chapters c join sections s on s.id = c.section_id
  )`;

export async function listBankQuestions(filters: BankFilters): Promise<{ rows: BankRow[]; hasMore: boolean }> {
  const search = filters.search.trim().slice(0, 100);
  const refNo = search ? parseQuestionRef(search) : null;
  const { rows } = await pool.query<{
    id: string;
    ref_no: number;
    type: QuestionType;
    status: QuestionStatus;
    stem_text: string;
    has_picture: boolean;
    chapter_number: number;
    chapter_title: string;
    book_chapter: number | null;
  }>(
    `with ${NUMBERED_CHAPTERS}
     select q.id, q.ref_no, q.type, q.status, q.stem_text, q.stem_media_id is not null as has_picture,
            n.number as chapter_number, n.title as chapter_title, hn.number as book_chapter
     from questions q
     join numbered n on n.id = q.chapter_id
     left join handbook_items hi on hi.question_id = q.id
     left join numbered hn on hn.id = hi.chapter_id
     where ($1::uuid is null or n.section_id = $1)
       and ($2::uuid is null or q.chapter_id = $2)
       and ($3::text is null or q.type = $3)
       and ($4::content_status is null or q.status = $4)
       and ($5 = '' or q.stem_text ilike '%' || $5 || '%' escape '\\' or q.ref_no = $6::int)
     order by n.section_position, n.position, q.ref_no
     limit $7 offset $8`,
    [
      filters.sectionId,
      filters.chapterId,
      filters.type,
      filters.status,
      escapeLike(search),
      refNo,
      BANK_PAGE_SIZE + 1,
      (filters.page - 1) * BANK_PAGE_SIZE,
    ]
  );

  return {
    hasMore: rows.length > BANK_PAGE_SIZE,
    rows: rows.slice(0, BANK_PAGE_SIZE).map((row) => ({
      id: row.id,
      refNo: row.ref_no,
      type: row.type,
      status: row.status,
      stemText: row.stem_text,
      hasPicture: row.has_picture,
      chapterLabel: `${chapterNumber(row.chapter_number)} ${row.chapter_title}`,
      bookChapter: row.book_chapter === null ? null : chapterNumber(row.book_chapter),
    })),
  };
}

export async function countQuestions(): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(`select count(*)::int as count from questions`);
  return rows[0].count;
}

// Sections with their chapters, in book order, for the filters.
export async function listChapterOptions(): Promise<SectionOptions[]> {
  const { rows } = await pool.query<{
    section_id: string;
    section_position: number;
    section_title: string;
    chapter_id: string | null;
    chapter_title: string | null;
    number: number | null;
  }>(
    `select s.id as section_id, s.position as section_position, s.title as section_title,
            c.id as chapter_id, c.title as chapter_title,
            case when c.id is null then null
                 else row_number() over (partition by c.id is null order by s.position, c.position)::int end as number
     from sections s left join chapters c on c.section_id = s.id
     order by s.position, c.position`
  );
  const sections: SectionOptions[] = [];
  for (const row of rows) {
    let section = sections.at(-1);
    if (!section || section.id !== row.section_id) {
      section = { id: row.section_id, label: `${sectionLetter(row.section_position)} · ${row.section_title}`, chapters: [] };
      sections.push(section);
    }
    if (row.chapter_id && row.number !== null) {
      section.chapters.push({ id: row.chapter_id, label: `${chapterNumber(row.number)} ${row.chapter_title}` });
    }
  }
  return sections;
}

type QuestionRow = {
  id: string;
  ref_no: number;
  chapter_id: string;
  type: QuestionType;
  status: QuestionStatus;
  stem_text: string;
  stem_media_id: string | null;
  content: unknown;
  answer: unknown;
  explanation: string | null;
  in_practice: boolean;
  in_mock: boolean;
  content_version: number;
};

// Reads and row-locks one question inside a transaction, for the change that follows.
export async function readQuestionForUpdate(client: PoolClient, id: string): Promise<StoredQuestion | null> {
  const { rows } = await client.query<QuestionRow>(
    `select id, ref_no, chapter_id, type, status, stem_text, stem_media_id, content, answer, explanation,
            in_practice, in_mock, content_version
     from questions where id = $1 for update`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    refNo: row.ref_no,
    chapterId: row.chapter_id,
    type: row.type,
    status: row.status,
    stemText: row.stem_text,
    stemMediaId: row.stem_media_id,
    content: row.content,
    answer: row.answer,
    explanation: row.explanation,
    inPractice: row.in_practice,
    inMock: row.in_mock,
    version: row.content_version,
  };
}

// Treat the user's % and _ literally; Postgres LIKE uses backslash as its escape.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
