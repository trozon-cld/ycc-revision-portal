import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { getSignedUrls, isStorageConfigured } from "@/lib/storage/storage";
import { chapterNumber, sectionLetter } from "@/lib/handbook/structure";
import { Badge } from "@/components/admin/badge";
import { PageHeader } from "@/components/admin/page-header";
import { Cell, Row, Table } from "@/components/admin/table";
import type { ChapterOutline } from "./category-chapters-form";
import type { CoverChoice } from "./category-covers-form";
import { CategoryRowActions, NewCategoryButton, type GroupOption } from "./category-row-actions";
import { GroupRowActions, NewGroupButton } from "./group-row-actions";

interface GroupRow {
  id: string;
  name: string;
}

interface CategoryRow {
  id: string;
  group_id: string;
  name: string;
  candidate_count: number;
}

interface CoverRow {
  category_id: string;
  side: "front" | "back";
  id: string;
  thumb_path: string;
  original_name: string;
  alt_text: string;
  width: number;
  height: number;
}

const THUMB_LINK_SECONDS = 60 * 60;

interface OutlineRow {
  section_id: string;
  section_position: number;
  section_title: string;
  chapter_id: string | null;
  chapter_title: string | null;
  number: number | null;
}

export default async function CategoriesPage() {
  await requireRole(["superadmin"]);

  const [{ rows: groups }, { rows: categories }, { rows: outlineRows }, { rows: links }, { rows: coverRows }] = await Promise.all([
    pool.query<GroupRow>(`select id, name from category_groups order by position`),
    // A candidate counts once, whether the category is their assigned one, their current one, or both.
    pool.query<CategoryRow>(
      `select c.id, c.group_id, c.name,
              (select count(*) from users u where u.category_id = c.id or u.current_category_id = c.id)::int
                as candidate_count
       from categories c
       order by c.name`
    ),
    pool.query<OutlineRow>(
      `select s.id as section_id, s.position as section_position, s.title as section_title,
              c.id as chapter_id, c.title as chapter_title,
              (row_number() over (partition by c.id is not null order by s.position, c.position))::int as number
       from sections s
       left join chapters c on c.section_id = s.id
       order by s.position, c.position`
    ),
    pool.query<{ category_id: string; chapter_id: string }>(`select category_id, chapter_id from category_chapters`),
    pool.query<CoverRow>(
      `select c.id as category_id, s.side, m.id, m.thumb_path, m.original_name, m.alt_text, m.width, m.height
       from categories c
       cross join lateral (values ('front', c.front_cover_media_id), ('back', c.back_cover_media_id)) as s (side, media_id)
       join media m on m.id = s.media_id`
    ),
  ]);

  const storageReady = isStorageConfigured();
  let thumbs = new Map<string, string>();
  if (storageReady && coverRows.length > 0) {
    try {
      thumbs = await getSignedUrls([...new Set(coverRows.map((row) => row.thumb_path))], THUMB_LINK_SECONDS);
    } catch (error) {
      console.error("Could not create cover picture links", error);
    }
  }
  const coversByCategory = new Map<string, { front: CoverChoice | null; back: CoverChoice | null }>();
  for (const row of coverRows) {
    const entry = coversByCategory.get(row.category_id) ?? { front: null, back: null };
    entry[row.side] = {
      id: row.id,
      thumbUrl: thumbs.get(row.thumb_path) ?? null,
      alt: row.alt_text,
      name: row.original_name,
      width: row.width,
      height: row.height,
    };
    coversByCategory.set(row.category_id, entry);
  }

  const outline = buildOutline(outlineRows);
  const totalChapters = outline.reduce((sum, section) => sum + section.chapters.length, 0);
  const linkedByCategory = new Map<string, string[]>();
  for (const link of links) {
    linkedByCategory.set(link.category_id, [...(linkedByCategory.get(link.category_id) ?? []), link.chapter_id]);
  }

  const groupOptions: GroupOption[] = groups.map((group) => ({ id: group.id, name: group.name }));

  return (
    <>
      <PageHeader
        title="Categories"
        description={`${count(groups.length, "group", "groups")} · ${count(categories.length, "category", "categories")}`}
        actions={
          <>
            <NewGroupButton />
            <NewCategoryButton groups={groupOptions} />
          </>
        }
      />

      <p className="mb-6 text-sm text-slate-600">
        Candidates can switch to any category in the same group as the one their admin assigned.
      </p>

      <div className="space-y-8">
        {groups.map((group, groupIndex) => {
          const groupCategories = categories.filter((category) => category.group_id === group.id);
          const headingId = `group-${group.id}`;
          return (
            <section key={group.id} aria-labelledby={headingId}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 id={headingId} className="text-base font-semibold text-ink [overflow-wrap:anywhere]">
                    {group.name}
                  </h2>
                  <p className="text-sm text-slate-600">{count(groupCategories.length, "category", "categories")}</p>
                </div>
                <GroupRowActions
                  id={group.id}
                  name={group.name}
                  categoryCount={groupCategories.length}
                  isFirst={groupIndex === 0}
                  isLast={groupIndex === groups.length - 1}
                />
              </div>

              <Table
                columns={["Name", "Candidates", "Chapters", "Covers", ""]}
                isEmpty={groupCategories.length === 0}
                emptyMessage="No categories in this group yet."
              >
                {groupCategories.map((category) => {
                  const linked = linkedByCategory.get(category.id) ?? [];
                  const covers = coversByCategory.get(category.id) ?? { front: null, back: null };
                  return (
                    <Row key={category.id}>
                      <Cell kind="primary">{category.name}</Cell>
                      <Cell label="Candidates">{category.candidate_count}</Cell>
                      <Cell label="Chapters" nowrap>
                        {linked.length === 0 ? (
                          <Badge tone="warning">None</Badge>
                        ) : (
                          `${linked.length} of ${totalChapters}`
                        )}
                      </Cell>
                      <Cell label="Covers" nowrap>
                        {describeCovers(covers.front !== null, covers.back !== null)}
                      </Cell>
                      <Cell kind="actions">
                        <CategoryRowActions
                          id={category.id}
                          name={category.name}
                          candidateCount={category.candidate_count}
                          outline={outline}
                          linkedChapterIds={linked}
                          otherGroups={groupOptions.filter((option) => option.id !== group.id)}
                          covers={covers}
                          storageReady={storageReady}
                        />
                      </Cell>
                    </Row>
                  );
                })}
              </Table>
            </section>
          );
        })}
      </div>
    </>
  );
}

function count(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`;
}

function describeCovers(front: boolean, back: boolean) {
  if (front && back) return "Front and back";
  if (front) return "Front only";
  if (back) return "Back only";
  return "Standard";
}

function buildOutline(rows: OutlineRow[]): ChapterOutline {
  const outline: ChapterOutline = [];
  for (const row of rows) {
    let section = outline.at(-1);
    if (!section || section.id !== row.section_id) {
      section = { id: row.section_id, label: `${sectionLetter(row.section_position)} · ${row.section_title}`, chapters: [] };
      outline.push(section);
    }
    if (row.chapter_id && row.chapter_title && row.number) {
      section.chapters.push({ id: row.chapter_id, number: chapterNumber(row.number), title: row.chapter_title });
    }
  }
  return outline;
}
