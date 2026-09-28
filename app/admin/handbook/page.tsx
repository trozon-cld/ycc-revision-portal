import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { chapterNumber, sectionLetter } from "@/lib/handbook/structure";
import { Badge } from "@/components/admin/badge";
import { PageHeader } from "@/components/admin/page-header";
import { buttonClass } from "@/components/admin/styles";
import { Cell, Row, Table } from "@/components/admin/table";
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
}

export default async function HandbookPage() {
  await requireRole(["superadmin"]);

  const [{ rows: sections }, { rows: chapters }] = await Promise.all([
    pool.query<SectionRow>(`select id, position, title from sections order by position`),
    pool.query<ChapterRow>(
      `select c.id, c.section_id, c.position, c.title, c.status,
              row_number() over (order by s.position, c.position)::int as number,
              (select count(*) from handbook_items i where i.chapter_id = c.id and i.content_page_id is not null)::int as page_count,
              (select count(*) from questions q where q.chapter_id = c.id)::int as question_count
       from chapters c
       join sections s on s.id = c.section_id
       order by s.position, c.position`
    ),
  ]);

  const sectionOptions: SectionOption[] = sections.map((section) => ({
    id: section.id,
    label: `${sectionLetter(section.position)} · ${section.title}`,
  }));

  return (
    <>
      <PageHeader
        title="Handbook"
        description={`${count(sections.length, "section")} · ${count(chapters.length, "chapter")}`}
        actions={
          <>
            <Link href="/admin/handbook/preview" className={buttonClass("secondary")}>
              Preview book
            </Link>
            <NewSectionButton />
            <NewChapterButton sections={sectionOptions} />
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

          return (
            <section key={section.id} aria-labelledby={headingId}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 id={headingId} className="text-base font-semibold text-ink [overflow-wrap:anywhere]">
                    {label}
                  </h2>
                  <p className="text-sm text-slate-600">{count(sectionChapters.length, "chapter")}</p>
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
                columns={["Chapter", "Pages", "Questions", "Status", ""]}
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
                    <Cell label="Status" nowrap>
                      <Badge tone={chapter.status === "published" ? "success" : "neutral"}>
                        {chapter.status === "published" ? "Published" : "Draft"}
                      </Badge>
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

function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
