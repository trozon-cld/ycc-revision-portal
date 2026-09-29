import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { isUuid } from "@/lib/content/pages";
import { loadBookCovers, loadPreviewBook, loadPreviewOptions } from "@/lib/content/preview";
import { PageHeader } from "@/components/admin/page-header";
import { PreviewControls, PreviewReader } from "./preview-client";

export default async function BookPreviewPage({ searchParams }: PageProps<"/admin/handbook/preview">) {
  await requireRole(["superadmin"]);
  const params = await searchParams;
  const options = await loadPreviewOptions();
  const chapterId = pick(params.chapter, options.chapters.map((chapter) => chapter.id));
  const categoryId = pick(params.category, options.categories.map((category) => category.id));
  const includeDrafts = one(params.content) !== "published";
  // Covers belong to a category's whole book, not to a single chapter.
  const [book, covers] = await Promise.all([
    loadPreviewBook({ chapterId, categoryId, includeDrafts }),
    categoryId && !chapterId ? loadBookCovers(categoryId) : null,
  ]);

  const chapter = options.chapters.find((item) => item.id === chapterId);
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const summary = [
    chapter ? chapter.label : plural(book.chapterCount, "chapter"),
    plural(book.pages.length, "item"),
    ...(includeDrafts && book.drafts > 0 ? [`${book.drafts} marked Draft`] : []),
  ].join(" · ");

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/admin/handbook" className="text-primary underline-offset-2 hover:underline">
          Handbook
        </Link>
        {chapter && (
          <>
            <span aria-hidden="true" className="mx-1.5 text-slate-500">/</span>
            <Link href={`/admin/handbook/chapters/${chapter.id}`} className="text-primary underline-offset-2 hover:underline">
              {chapter.label}
            </Link>
          </>
        )}
        <span aria-hidden="true" className="mx-1.5 text-slate-500">/</span>
        <span className="text-slate-700">Preview</span>
      </nav>
      <PageHeader title="Book preview" description="The Handbook as candidates will read it. Only you can see this preview." />

      <PreviewControls
        chapters={options.chapters}
        categories={options.categories}
        chapterId={chapterId}
        categoryId={categoryId}
        includeDrafts={includeDrafts}
      />

      {book.leftOut.length > 0 && (
        <div role="note" className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-600/25">
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
      )}

      {book.pages.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
          {emptyMessage(Boolean(chapterId), Boolean(categoryId), includeDrafts)}
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-700">{summary}</p>
          <PreviewReader pages={book.pages} media={book.media} covers={covers ?? undefined} />
        </>
      )}
    </>
  );
}

function emptyMessage(oneChapter: boolean, byCategory: boolean, includeDrafts: boolean): string {
  if (byCategory && oneChapter) return "This chapter isn't included in that category, or it has nothing to show yet.";
  if (!includeDrafts) return "Nothing here is published yet. Choose \"Include drafts\" to preview drafts too.";
  if (byCategory) return "That category doesn't include any chapter with pages or questions yet.";
  return oneChapter ? "This chapter has no pages or questions yet." : "The Handbook has no pages or questions yet.";
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Only ids that exist; anything else shows the whole book.
function pick(value: string | string[] | undefined, known: string[]): string | null {
  const id = one(value)?.toLowerCase();
  return id && isUuid(id) && known.includes(id) ? id : null;
}
