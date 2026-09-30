import { pool } from "@/lib/db/pool";

export type CategoryGroupOption = { id: string; label: string; categories: { id: string; name: string }[] };

// Every category under its group, in group order, for the chapter-side category pickers.
export async function loadCategoryGroups(): Promise<CategoryGroupOption[]> {
  const { rows } = await pool.query<{ group_id: string; group_name: string; id: string | null; name: string | null }>(
    `select g.id as group_id, g.name as group_name, c.id, c.name
     from category_groups g
     left join categories c on c.group_id = g.id
     order by g.position, lower(c.name)`
  );
  const groups: CategoryGroupOption[] = [];
  for (const row of rows) {
    let group = groups.find((item) => item.id === row.group_id);
    if (!group) {
      group = { id: row.group_id, label: row.group_name, categories: [] };
      groups.push(group);
    }
    if (row.id && row.name) group.categories.push({ id: row.id, name: row.name });
  }
  return groups;
}

// Which categories include each chapter.
export async function loadChapterCategoryIds(chapterIds?: string[]): Promise<Map<string, string[]>> {
  const { rows } = await pool.query<{ chapter_id: string; category_id: string }>(
    `select chapter_id, category_id from category_chapters
     where $1::uuid[] is null or chapter_id = any($1::uuid[])`,
    [chapterIds ?? null]
  );
  const links = new Map<string, string[]>();
  for (const row of rows) links.set(row.chapter_id, [...(links.get(row.chapter_id) ?? []), row.category_id]);
  return links;
}

// "A, B and 3 more": keeps log details and notes short.
export function listNames(names: string[], max = 8): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}
