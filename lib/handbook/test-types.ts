import { pool } from "@/lib/db/pool";

export type TestAreaOption = { id: string; label: string; testTypes: { id: string; name: string }[] };

// Every test type under its test area, in test area order, for the chapter-side test type pickers.
export async function loadTestAreas(): Promise<TestAreaOption[]> {
  const { rows } = await pool.query<{ test_area_id: string; test_area_name: string; id: string | null; name: string | null }>(
    `select g.id as test_area_id, g.name as test_area_name, c.id, c.name
     from test_areas g
     left join test_types c on c.test_area_id = g.id
     order by g.position, c.position`
  );
  const testAreas: TestAreaOption[] = [];
  for (const row of rows) {
    let testArea = testAreas.find((item) => item.id === row.test_area_id);
    if (!testArea) {
      testArea = { id: row.test_area_id, label: row.test_area_name, testTypes: [] };
      testAreas.push(testArea);
    }
    if (row.id && row.name) testArea.testTypes.push({ id: row.id, name: row.name });
  }
  return testAreas;
}

// Which test types include each chapter.
export async function loadChapterTestTypeIds(chapterIds?: string[]): Promise<Map<string, string[]>> {
  const { rows } = await pool.query<{ chapter_id: string; test_type_id: string }>(
    `select chapter_id, test_type_id from test_type_chapters
     where $1::uuid[] is null or chapter_id = any($1::uuid[])`,
    [chapterIds ?? null]
  );
  const links = new Map<string, string[]>();
  for (const row of rows) links.set(row.chapter_id, [...(links.get(row.chapter_id) ?? []), row.test_type_id]);
  return links;
}

// "A, B and 3 more": keeps log details and notes short.
export function listNames(names: string[], max = 8): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}
