import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { loadCategoryGroups, loadChapterCategoryIds } from "@/lib/handbook/categories";
import { chapterNumber, sectionLetter } from "@/lib/handbook/structure";
import { Badge } from "@/components/admin/badge";
import { PageHeader } from "@/components/admin/page-header";
import { buttonClass } from "@/components/admin/styles";
import { Cell, Row, Table } from "@/components/admin/table";
import { countOf } from "@/lib/format";
import { ChapterRowActions, NewChapterButton } from "./chapter-row-actions";
import { NewSectionButton, SectionRowActions, type SectionOption } from "./section-row-actions";

interface SectionRow {
  id: string;
  position: number;
  title: string;
}

interface ChapterRow {
  id: string;
  section_id: string;
  position: number;
  number: number;
  title: string;
  status: "draft" | "published";
  page_count: number;
  question_count: number;
  item_count: number;
  draft_count: number;
}

export default async function HandbookPage() {
  await requireRole(["superadmin"]);

  const [{ rows: sections }, { rows: chapters }, categoryGroups, chapterCategories] = await Promise.all([
    pool.query<SectionRow>(`select id, position, title from sections order by position`),
    pool.query<ChapterRow>(
      `select c.id, c.section_id, c.position, c.title, c.status,
              row_number() over (order by s.position, c.position)::int as number,
              (select count(*) from handbook_items i where i.chapter_id = c.id and i.content_page_id is not null)::int as page_count,
              (select count(*) from questions q where q.chapter_id = c.id)::int as question_count,
              (select count(*) from handbook_items i where i.chapter_id = c.id)::int as item_count,
              (select count(*) from handbook_items i
                 left join content_pages p on p.id = i.content_page_id
                 left join questions q on q.id = i.question_id
                 where i.chapter_id = c.id and coalesce(p.status, q.status) <> 'published')::int as draft_count
       from chapters c
       join sections s on s.id = c.section_id
       order by s.position, c.position`
    ),
    loadCategoryGroups(),
    loadChapterCategoryIds(),
  ]);
  const categoryTotal = categoryGroups.reduce((sum, group) => sum + group.categories.length, 0);

  const sectionOptions: SectionOption[] = sections.map((section) => ({
    id: section.id,
    label: `${sectionLetter(section.position)} · ${section.title}`,
  }));

  return (
    <>
      <PageHeader
        title="Handbook"
        description={`${countOf(sections.length, "section")} · ${countOf(chapters.length, "chapter")}`}
        actions={
          <>
            <Link href="/admin/handbook/preview" className={buttonClass("secondary")}>
              Preview book
            </Link>
            <NewSectionButton />
            <NewChapterButton sections={sectionOptions} categoryGroups={categoryGroups} />
          </>
        }
      />

      {sections.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
          No sections yet. Add a section, then add chapters to it.
        </p>
      )}

      <div className="space-y-8">
        {sections.map((section, sectionIndex) => {
          const sectionChapters = chapters.filter((chapter) => chapter.section_id === section.id);
          const headingId = `section-${section.id}`;
          const label = sectionOptions[sectionIndex].label;
          const uncategorised = sectionChapters.filter((chapter) => !chapterCategories.get(chapter.id)?.length).length;

          return (
            <section key={section.id} aria-labelledby={headingId}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 id={headingId} className="text-base font-semibold text-ink [overflow-wrap:anywhere]">
                    {label}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {countOf(sectionChapters.length, "chapter")}
                    {/* A section is in the book once one of its chapters is published. */}
                    {!sectionChapters.some((chapter) => chapter.status === "published") && " · Not in the book yet"}
                    {uncategorised > 0 && (
                      <span className="font-medium text-amber-900">
                        {" · "}
                        {uncategorised === 1 ? "1 chapter isn't" : `${uncategorised} chapters aren't`} in any category
                      </span>
                    )}
                  </p>
                </div>
                <SectionRowActions
                  id={section.id}
                  label={label}
                  title={section.title}
                  chapterCount={sectionChapters.length}
                  isFirst={sectionIndex === 0}
                  isLast={sectionIndex === sections.length - 1}
                />
              </div>

              <Table
                columns={["Chapter", "Pages", "Questions", "Categories", "Status", ""]}
                isEmpty={sectionChapters.length === 0}
                emptyMessage="No chapters in this section yet."
              >
                {sectionChapters.map((chapter, index) => (
                  <Row key={chapter.id}>
                    <Cell kind="primary">
                      <span className="mr-1 font-mono text-slate-600 tabular-nums">{chapterNumber(chapter.number)}</span>{" "}
                      <Link
                        href={`/admin/handbook/chapters/${chapter.id}`}
                        className="text-ink underline-offset-2 hover:text-primary hover:underline"
                      >
                        {chapter.title}
                      </Link>
                    </Cell>
                    <Cell label="Pages">{chapter.page_count}</Cell>
                    <Cell label="Questions">{chapter.question_count}</Cell>
                    <Cell label="Categories">
                      <CategoryCount linked={chapterCategories.get(chapter.id)?.length ?? 0} total={categoryTotal} />
                    </Cell>
                    <Cell label="Status">
                      <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1 md:justify-start">
                        <Badge tone={chapter.status === "published" ? "success" : "neutral"}>
                          {chapter.status === "published" ? "Published" : "Draft"}
                        </Badge>
                        <Readiness status={chapter.status} items={chapter.item_count} drafts={chapter.draft_count} />
                      </span>
                    </Cell>
                    <Cell kind="actions">
                      <ChapterRowActions
                        id={chapter.id}
                        title={chapter.title}
                        number={chapterNumber(chapter.number)}
                        isFirst={index === 0}
                        isLast={index === sectionChapters.length - 1}
                        otherSections={sectionOptions.filter((option) => option.id !== section.id)}
                        pageCount={chapter.page_count}
                        questionCount={chapter.question_count}
                        status={chapter.status}
                        categoryGroups={categoryGroups}
                        categoryIds={chapterCategories.get(chapter.id) ?? []}
                      />
                    </Cell>
                  </Row>
                ))}
              </Table>
            </section>
          );
        })}
      </div>
    </>
  );
}

function CategoryCount({ linked, total }: { linked: number; total: number }) {
  if (linked === 0) return <Badge tone="warning">None</Badge>;
  return <>{linked === total ? `All ${total}` : `${linked} of ${total}`}</>;
}

// Whether a draft chapter can be published, or what a published one is missing.
function Readiness({ status, items, drafts }: { status: "draft" | "published"; items: number; drafts: number }) {
  const itemsWord = (n: number) => (n === 1 ? "1 item is a draft" : `${n} items are drafts`);
  if (status === "published") {
    if (items === 0) return <span className="text-sm font-medium text-amber-900">No pages or questions</span>;
    if (drafts > 0) return <span className="text-sm font-medium text-amber-900">{itemsWord(drafts)}</span>;
    return null;
  }
  if (items === 0) return <span className="text-sm text-slate-600">Empty</span>;
  if (drafts > 0) return <span className="text-sm text-slate-600">{drafts} of {items} items are drafts</span>;
  return <span className="text-sm font-medium text-green-800">Ready to publish</span>;
}
