import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { getSignedUrls, isStorageConfigured } from "@/lib/storage/storage";
import { chapterNumber, sectionLetter } from "@/lib/handbook/structure";
import { Badge } from "@/components/admin/badge";
import { PageHeader } from "@/components/admin/page-header";
import { Cell, Row, Table } from "@/components/admin/table";
import { countOf } from "@/lib/format";
import type { ListenMode } from "@/lib/voice/language-store";
import type { ListenLanguageOption } from "./test-type-listen-form";
import type { ChapterOutline } from "./test-type-chapters-form";
import type { CoverChoice } from "./test-type-covers-form";
import { TestTypeRowActions, NewTestTypeButton, type TestAreaOption } from "./test-type-row-actions";
import { TestAreaRowActions, NewTestAreaButton } from "./test-area-row-actions";
import { loadStructureLockView } from "@/lib/handbook/structure-lock";
import { StructureLockBar } from "../handbook/structure-lock-bar";

export const metadata: Metadata = { title: "Test types" };

interface TestAreaRow {
  id: string;
  name: string;
}

interface TestTypeRow {
  id: string;
  test_area_id: string;
  name: string;
  candidate_count: number;
  // Candidates whose current test type this is (they see its chapters now).
  studying: number;
  listen_mode: ListenMode;
  // Chosen Listen languages that aren't hidden (used when listen_mode is "chosen").
  chosen: string[];
}

interface CoverRow {
  test_type_id: string;
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
  linked_to_all: boolean;
  chapter_id: string | null;
  chapter_title: string | null;
  number: number | null;
}

export default async function TestTypesPage() {
  await requireRole(["superadmin"]);

  const [{ rows: testAreas }, { rows: testTypes }, { rows: outlineRows }, { rows: links }, { rows: coverRows }, lock] = await Promise.all([
    pool.query<TestAreaRow>(`select id, name from test_areas order by position`),
    // A candidate counts once, whether the test type is their assigned one, their current one, or both.
    pool.query<TestTypeRow>(
      `select c.id, c.test_area_id, c.name, c.listen_mode,
              array(select cl.language from test_type_languages cl join voice_languages l on l.code = cl.language and l.status <> 'hidden'
                    where cl.test_type_id = c.id order by l.name) as chosen,
              (select count(*) from users u where u.test_type_id = c.id or u.current_test_type_id = c.id)::int
                as candidate_count,
              (select count(*) from users u where u.role = 'candidate' and u.current_test_type_id = c.id)::int as studying
       from test_types c
       order by c.position`
    ),
    pool.query<OutlineRow>(
      `select s.id as section_id, s.position as section_position, s.title as section_title, s.linked_to_all,
              c.id as chapter_id, c.title as chapter_title,
              (row_number() over (partition by c.id is not null order by s.position, c.position))::int as number
       from sections s
       left join chapters c on c.section_id = s.id
       order by s.position, c.position`
    ),
    pool.query<{ test_type_id: string; chapter_id: string }>(`select test_type_id, chapter_id from test_type_chapters`),
    pool.query<CoverRow>(
      `select c.id as test_type_id, s.side, m.id, m.thumb_path, m.original_name, m.alt_text, m.width, m.height
       from test_types c
       cross join lateral (values ('front', c.front_cover_media_id), ('back', c.back_cover_media_id)) as s (side, media_id)
       join media m on m.id = s.media_id`
    ),
    loadStructureLockView(),
  ]);

  // Languages a test type can offer besides English: live and draft ones (drafts are offered once they go live).
  const { rows: languageRows } = await pool.query<{ code: string; name: string; status: string }>(
    `select code, name, status from voice_languages where code <> 'en' and status <> 'hidden' order by name`
  );
  const listenLanguages: ListenLanguageOption[] = languageRows.map((row) => ({ code: row.code, name: row.name, draft: row.status === "draft" }));

  const storageReady = isStorageConfigured();
  let thumbs = new Map<string, string>();
  if (storageReady && coverRows.length > 0) {
    try {
      thumbs = await getSignedUrls([...new Set(coverRows.map((row) => row.thumb_path))], THUMB_LINK_SECONDS);
    } catch (error) {
      console.error("Could not create cover picture links", error);
    }
  }
  const coversByTestType = new Map<string, { front: CoverChoice | null; back: CoverChoice | null }>();
  for (const row of coverRows) {
    const entry = coversByTestType.get(row.test_type_id) ?? { front: null, back: null };
    entry[row.side] = {
      id: row.id,
      thumbUrl: thumbs.get(row.thumb_path) ?? null,
      alt: row.alt_text,
      name: row.original_name,
      width: row.width,
      height: row.height,
    };
    coversByTestType.set(row.test_type_id, entry);
  }

  const outline = buildOutline(outlineRows, links, testTypes);
  const totalChapters = outline.reduce((sum, section) => sum + section.chapters.length, 0);
  const linkedByTestType = new Map<string, string[]>();
  for (const link of links) {
    linkedByTestType.set(link.test_type_id, [...(linkedByTestType.get(link.test_type_id) ?? []), link.chapter_id]);
  }

  const testAreaOptions: TestAreaOption[] = testAreas.map((testArea) => ({ id: testArea.id, name: testArea.name }));

  return (
    <>
      <PageHeader
        title="Test types"
        description={`${countOf(testAreas.length, "test area", "test areas")} · ${countOf(testTypes.length, "test type", "test types")}`}
        actions={
          <>
            <NewTestAreaButton />
            <NewTestTypeButton testAreas={testAreaOptions} />
          </>
        }
      />

      <p className="mb-4 text-sm text-slate-600">
        Candidates can switch to any test type in the same test area as the one their Admin assigned.
      </p>

      <StructureLockBar lock={lock} />

      <div className="space-y-8">
        {testAreas.map((testArea, testAreaIndex) => {
          const testAreaTestTypes = testTypes.filter((testType) => testType.test_area_id === testArea.id);
          const headingId = `test-area-${testArea.id}`;
          return (
            <section key={testArea.id} aria-labelledby={headingId}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 id={headingId} className="text-base font-semibold text-ink [overflow-wrap:anywhere]">
                    {testArea.name}
                  </h2>
                  <p className="text-sm text-slate-600">{countOf(testAreaTestTypes.length, "test type", "test types")}</p>
                </div>
                <TestAreaRowActions
                  id={testArea.id}
                  name={testArea.name}
                  testTypeCount={testAreaTestTypes.length}
                  isFirst={testAreaIndex === 0}
                  isLast={testAreaIndex === testAreas.length - 1}
                />
              </div>

              <Table
                columns={["Name", "Candidates", "Chapters", "Covers", "Listen", ""]}
                widths={["", "md:w-32", "md:w-32", "md:w-40", "md:w-32", "md:w-14"]}
                isEmpty={testAreaTestTypes.length === 0}
                emptyMessage="No test types in this test area yet."
              >
                {testAreaTestTypes.map((testType, testTypeIndex) => {
                  const linked = linkedByTestType.get(testType.id) ?? [];
                  const covers = coversByTestType.get(testType.id) ?? { front: null, back: null };
                  return (
                    <Row key={testType.id}>
                      <Cell kind="primary">{testType.name}</Cell>
                      <Cell label="Candidates">
                        {testType.candidate_count > 0 ? (
                          <Link href={`/admin/candidates?testType=${testType.id}`} className="inline-flex min-h-6 min-w-6 items-center justify-center text-primary underline underline-offset-2">
                            {testType.candidate_count}
                            <span className="sr-only"> candidates: see them</span>
                          </Link>
                        ) : (
                          0
                        )}
                      </Cell>
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
                      <Cell label="Listen" nowrap>
                        <ListenBadge mode={testType.listen_mode} chosen={testType.chosen.length} />
                      </Cell>
                      <Cell kind="actions">
                        <TestTypeRowActions
                          id={testType.id}
                          name={testType.name}
                          candidateCount={testType.candidate_count}
                          studying={testType.studying}
                          structureLocked={lock.locked}
                          outline={outline}
                          linkedChapterIds={linked}
                          otherTestAreas={testAreaOptions.filter((option) => option.id !== testArea.id)}
                          covers={covers}
                          storageReady={storageReady}
                          listenMode={testType.listen_mode}
                          listenChosen={testType.chosen}
                          listenLanguages={listenLanguages}
                          isFirst={testTypeIndex === 0}
                          isLast={testTypeIndex === testAreaTestTypes.length - 1}
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

function describeCovers(front: boolean, back: boolean) {
  if (front && back) return "Front and back";
  if (front) return "Front only";
  if (back) return "Back only";
  return "Standard";
}

function buildOutline(
  rows: OutlineRow[],
  links: { test_type_id: string; chapter_id: string }[],
  testTypes: { id: string; name: string }[]
): ChapterOutline {
  const names = new Map(testTypes.map((testType) => [testType.id, testType.name]));
  const outline: ChapterOutline = [];
  for (const row of rows) {
    let section = outline.at(-1);
    if (!section || section.id !== row.section_id) {
      section = {
        id: row.section_id,
        label: `${sectionLetter(row.section_position)} · ${row.section_title}`,
        linkedToAll: row.linked_to_all,
        chapters: [],
      };
      outline.push(section);
    }
    if (row.chapter_id && row.chapter_title && row.number) {
      // Who has a chapter outside the "every test type" sections, so other test types show it as taken.
      const owners = row.linked_to_all
        ? []
        : links
            .filter((link) => link.chapter_id === row.chapter_id)
            .map((link) => ({ id: link.test_type_id, name: names.get(link.test_type_id) ?? "" }))
            .sort((a, b) => a.name.localeCompare(b.name));
      section.chapters.push({ id: row.chapter_id, number: chapterNumber(row.number), title: row.chapter_title, owners });
    }
  }
  return outline;
}

// The Listen column: Off, All languages, or how many languages (English plus the chosen ones).
function ListenBadge({ mode, chosen }: { mode: ListenMode; chosen: number }) {
  if (mode === "off") return <Badge tone="neutral">Off</Badge>;
  if (mode === "all") return <Badge tone="success">All languages</Badge>;
  return <Badge tone="info">{countOf(chosen + 1, "language", "languages")}</Badge>;
}
