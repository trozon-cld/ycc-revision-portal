import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { loadBookCovers, loadPreviewBook, loadPreviewOptions } from "@/lib/content/preview";
import { isUuid } from "@/lib/ids";
import { firstParam } from "@/lib/params";
import { PageHeader } from "@/components/admin/page-header";
import { countOf } from "@/lib/format";
import { ApplyingReporter, PreviewWorkspace } from "./preview-client";
import { FilterBar, FilterSelect } from "@/components/admin/filter-bar";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { warnNoteClass } from "@/components/admin/styles";

export const metadata: Metadata = { title: "Book Preview" };

export default async function BookPreviewPage({ searchParams }: PageProps<"/admin/handbook/preview">) {
  await requireRole(CONTENT_EDITORS);
  const params = await searchParams;
  const options = await loadPreviewOptions();
  const chapterId = pick(params.chapter, options.chapters.map((chapter) => chapter.id));
  const testTypeId = pick(params.testType, options.testTypes.map((testType) => testType.id));
  const includeDrafts = firstParam(params.content) !== "published";
  // Covers belong to a test type's whole book, not to a single chapter.
  const [book, covers] = await Promise.all([
    loadPreviewBook({ chapterId, testTypeId, includeDrafts }),
    testTypeId && !chapterId ? loadBookCovers(testTypeId) : null,
  ]);

  const chapter = options.chapters.find((item) => item.id === chapterId);
  const sections = [...new Set(options.chapters.map((item) => item.sectionLabel))];
  // With a test type the reader numbers chapters in that book; the summary follows it.
  const chapterInBook = testTypeId ? book.pages[0]?.chapterLabel : undefined;
  const summary = [
    chapter ? (chapterInBook ?? chapter.label) : countOf(book.chapterCount, "chapter"),
    countOf(book.pages.length, "item"),
    ...(includeDrafts && book.drafts > 0 ? [`${book.drafts} marked Draft`] : []),
  ].join(" · ");

  const filters = (
    <FilterBar action="/admin/handbook/preview" clearHref="/admin/handbook/preview" isFiltered={Boolean(chapterId || testTypeId || !includeDrafts)}>
      <FilterSelect name="chapter" label="Show" defaultValue={chapterId ?? ""} wide>
        <option value="">Whole book</option>
        {sections.map((section) => (
          <optgroup key={section} label={section}>
            {options.chapters
              .filter((item) => item.sectionLabel === section)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
          </optgroup>
        ))}
      </FilterSelect>
      <FilterSelect name="testType" label="As test type" defaultValue={testTypeId ?? ""} wide>
        <option value="">All test types</option>
        {options.testTypes.map((testType) => (
          <option key={testType.id} value={testType.id}>
            {testType.label}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect name="content" label="Content" defaultValue={includeDrafts ? "" : "published"}>
        <option value="">Include drafts</option>
        <option value="published">Published only</option>
      </FilterSelect>
      <ApplyingReporter />
    </FilterBar>
  );
  const leftOut = book.leftOut.length > 0 && (
    <div role="note" className={`mb-3 ${warnNoteClass}`}>
      <p className="font-medium">
        {book.leftOut.length === 1 ? "1 item is" : `${book.leftOut.length} items are`} left out because {book.leftOut.length === 1 ? "it doesn't" : "they don't"} pass the checks yet:
      </p>
      <ul className="mt-1 list-disc pl-5">
        {book.leftOut.slice(0, 10).map((item) => (
          <li key={item} className="[overflow-wrap:anywhere]">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Handbook", href: "/admin/handbook" },
          ...(chapter ? [{ label: chapter.label, href: `/admin/handbook/chapters/${chapter.id}` }] : []),
          { label: "Preview", current: true },
        ]}
      />
      <PageHeader title="Book Preview" description="The Handbook as candidates will read it. Only you can see this preview." />

      {book.pages.length === 0 ? (
        <>
          {filters}
          {leftOut}
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
            {emptyMessage(Boolean(chapterId), Boolean(testTypeId), includeDrafts)}
          </p>
        </>
      ) : (
        <PreviewWorkspace filters={filters} pages={book.pages} media={book.media} covers={covers ?? undefined}>
          {leftOut}
          <p className="mb-3 text-sm text-slate-700">{summary}</p>
        </PreviewWorkspace>
      )}
    </>
  );
}

function emptyMessage(oneChapter: boolean, byTestType: boolean, includeDrafts: boolean): string {
  if (byTestType && oneChapter) return "This chapter isn't included in that test type, or it has nothing to show yet.";
  if (!includeDrafts) return "Nothing here is published yet. Choose \"Include drafts\" to preview drafts too.";
  if (byTestType) return "That test type doesn't include any chapter with pages or questions yet.";
  return oneChapter ? "This chapter has no pages or questions yet." : "The Handbook has no pages or questions yet.";
}


// Only ids that exist; anything else shows the whole book.
function pick(value: string | string[] | undefined, known: string[]): string | null {
  const id = firstParam(value)?.toLowerCase();
  return id && isUuid(id) && known.includes(id) ? id : null;
}
