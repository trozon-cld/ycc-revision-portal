import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { chapterNumber, sectionLetter } from "@/lib/handbook/structure";
import { Badge } from "@/components/admin/badge";
import { PageHeader } from "@/components/admin/page-header";
import { Cell, Row, Table } from "@/components/admin/table";
import type { ChapterOutline } from "./category-chapters-form";
import { CategoryRowActions, NewCategoryButton } from "./category-row-actions";

interface CategoryRow {
  id: string;
  name: string;
  candidate_count: number;
}

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

  const [{ rows: categories }, { rows: outlineRows }, { rows: links }] = await Promise.all([
    pool.query<CategoryRow>(
      `select c.id, c.name, count(u.id)::int as candidate_count
       from categories c
       left join users u on u.category_id = c.id
       group by c.id, c.name
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
  ]);

  const outline = buildOutline(outlineRows);
  const totalChapters = outline.reduce((sum, section) => sum + section.chapters.length, 0);
  const linkedByCategory = new Map<string, string[]>();
  for (const link of links) {
    linkedByCategory.set(link.category_id, [...(linkedByCategory.get(link.category_id) ?? []), link.chapter_id]);
  }

  return (
    <>
      <PageHeader
        title="Categories"
        description={`${categories.length} categor${categories.length === 1 ? "y" : "ies"}`}
        actions={<NewCategoryButton />}
      />

      <Table
        columns={["Name", "Candidates", "Chapters", ""]}
        isEmpty={categories.length === 0}
        emptyMessage="No categories yet."
      >
        {categories.map((category) => {
          const linked = linkedByCategory.get(category.id) ?? [];
          return (
            <Row key={category.id}>
              <Cell kind="primary">{category.name}</Cell>
              <Cell label="Candidates">{category.candidate_count}</Cell>
              <Cell label="Chapters" nowrap>
                {linked.length === 0 ? <Badge tone="warning">None</Badge> : `${linked.length} of ${totalChapters}`}
              </Cell>
              <Cell kind="actions">
                <CategoryRowActions
                  id={category.id}
                  name={category.name}
                  candidateCount={category.candidate_count}
                  outline={outline}
                  linkedChapterIds={linked}
                />
              </Cell>
            </Row>
          );
        })}
      </Table>
    </>
  );
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
