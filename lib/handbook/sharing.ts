import type { PoolClient } from "pg";
import { sectionLetter } from "@/lib/handbook/structure";

// Section linking (0040): a section linked to every test type puts each of its chapters in every test type's
// book (A–D); in any other section (E) a chapter belongs to one test type at most.

export const EVERY_TEST_TYPE = "Every test type";

export const everyTestTypeOnly = (section: string) =>
  `Chapters in ${section} are in every test type's book, so their test types can't be changed.`;
export const oneTestTypeOnly = (section: string) => `A chapter in ${section} can be in one test type only.`;

// For a backup made before 0040: sections whose every chapter is in every test type become linked to every test type.
export const DERIVE_SECTION_LINKING_SQL = `update sections s set linked_to_all = true
where exists (select 1 from chapters c where c.section_id = s.id)
  and not exists (
    select 1 from chapters c cross join test_types t
    where c.section_id = s.id
      and not exists (select 1 from test_type_chapters l where l.chapter_id = c.id and l.test_type_id = t.id)
  )`;

export type SectionLinking = { id: string; title: string; label: string; linkedToAll: boolean };

export async function sectionLinking(client: PoolClient, sectionId: string): Promise<SectionLinking | null> {
  const { rows } = await client.query<{ id: string; title: string; position: number; linked_to_all: boolean }>(
    `select id, title, position, linked_to_all from sections where id = $1`,
    [sectionId]
  );
  const row = rows[0];
  return row ? { id: row.id, title: row.title, label: `${sectionLetter(row.position)} · ${row.title}`, linkedToAll: row.linked_to_all } : null;
}

export async function linkToEveryTestType(client: PoolClient, chapterId: string): Promise<void> {
  await client.query(
    `insert into test_type_chapters (test_type_id, chapter_id) select id, $1::uuid from test_types on conflict do nothing`,
    [chapterId]
  );
}

// A new test type gets every chapter of the sections linked to every test type.
export async function linkSharedChapters(client: PoolClient, testTypeId: string): Promise<number> {
  const { rowCount } = await client.query(
    `insert into test_type_chapters (test_type_id, chapter_id)
     select $1::uuid, c.id from chapters c join sections s on s.id = c.section_id where s.linked_to_all
     on conflict do nothing`,
    [testTypeId]
  );
  return rowCount ?? 0;
}

export async function sharedChapterIds(client: PoolClient): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `select c.id from chapters c join sections s on s.id = c.section_id where s.linked_to_all`
  );
  return rows.map((row) => row.id);
}

// The first chosen chapter that already belongs to another test type, as a refusal message.
export async function claimedElsewhere(client: PoolClient, testTypeId: string, chapterIds: string[]): Promise<string | null> {
  if (chapterIds.length === 0) return null;
  const { rows } = await client.query<{ title: string; owner: string; position: number; section_title: string }>(
    `select c.title, t.name as owner, s.position, s.title as section_title
     from test_type_chapters l
     join chapters c on c.id = l.chapter_id
     join sections s on s.id = c.section_id
     join test_types t on t.id = l.test_type_id
     where l.chapter_id = any($1::uuid[]) and l.test_type_id <> $2 and not s.linked_to_all
     order by s.position, c.position, t.name
     limit 1`,
    [chapterIds, testTypeId]
  );
  const row = rows[0];
  if (!row) return null;
  return `"${row.title}" already belongs to ${row.owner}. ${oneTestTypeOnly(`${sectionLetter(row.position)} · ${row.section_title}`)}`;
}
