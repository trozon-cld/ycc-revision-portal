import type { PoolClient } from "pg";
import { TITLE_MAX_LENGTH } from "@/lib/limits";
import { cleanLine } from "@/lib/text";
import type { FormState } from "@/lib/forms";

export type StructureActionState = FormState;

export const MAX_SECTIONS = 26;

// Serialises every change to the items' order within chapters; reads are not blocked.
export async function lockHandbookOrder(client: PoolClient) {
  await client.query(`lock table handbook_items in share row exclusive mode`);
}

// Serialises every change to section/chapter order; reads are not blocked.
export async function lockHandbookStructure(client: PoolClient) {
  await client.query(`lock table sections, chapters in share row exclusive mode`);
}

export function normaliseTitle(value: FormDataEntryValue | string | null | undefined): string {
  return cleanLine(value);
}

export function validateTitle(title: string, noun: "Section" | "Chapter"): string | null {
  if (!title) return `${noun} title is required.`;
  if (title.length > TITLE_MAX_LENGTH) return `${noun} title must be ${TITLE_MAX_LENGTH} characters or fewer.`;
  return null;
}

export function sectionLetter(position: number): string {
  return String.fromCharCode(64 + position);
}

export function chapterNumber(number: number): string {
  return String(number).padStart(2, "0");
}

// Chapters as a reader numbers them: across the whole Handbook (staff lists), or within a test type's book
// (its linked chapters, drafts included), so a specialist chapter is 17. Chapters outside that book get no number.
export function numberedChapters(testTypeParam?: string): string {
  const columns = `c.id, c.title, c.status, s.position as section_position, s.title as section_title,
         (row_number() over (order by s.position, c.position))::int as place`;
  if (!testTypeParam) {
    return `numbered as (
  select ${columns}, (row_number() over (order by s.position, c.position))::int as number
  from chapters c join sections s on s.id = c.section_id
)`;
  }
  return `numbered as (
  select ${columns},
         case when tc.chapter_id is null then null
              else (row_number() over (partition by tc.chapter_id is null order by s.position, c.position))::int end as number
  from chapters c join sections s on s.id = c.section_id
  left join test_type_chapters tc on tc.chapter_id = c.id and tc.test_type_id = ${testTypeParam}
)`;
}

// "17 Supervisory"; a chapter outside the book shows its title alone.
export const chapterLabel = (row: { number: number | null; title: string }) =>
  row.number === null ? row.title : `${chapterNumber(row.number)} ${row.title}`;
