import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { getChapterContext } from "@/lib/content/pages";
import { questionLogLabel } from "@/lib/questions/labels";
import { questionTypeLabel } from "@/lib/questions/registry";
import type { QuestionType } from "@/lib/questions/types";
import { PageHeader } from "@/components/admin/page-header";
import { buttonClass } from "@/components/admin/styles";
import { AddQuestionsButton, ChapterOrder, type AddableQuestion, type OrderItem } from "./chapter-order";
import { NewPageButton } from "./page-row-actions";

interface ItemRow {
  id: string;
  position: number;
  page_id: string | null;
  page_title: string | null;
  page_status: "draft" | "published" | null;
  block_count: number | null;
  picture_count: number | null;
  question_id: string | null;
  ref_no: number | null;
  stem_text: string | null;
  question_type: QuestionType | null;
  question_status: "draft" | "published" | null;
}

interface QuestionRow {
  id: string;
  ref_no: number;
  stem_text: string;
  type: QuestionType;
  status: "draft" | "published";
}

export default async function ChapterPagesPage({ params }: PageProps<"/admin/handbook/chapters/[chapterId]">) {
  await requireRole(["superadmin"]);
  const { chapterId } = await params;
  const chapter = await getChapterContext(chapterId);
  if (!chapter) notFound();

  const [{ rows }, { rows: unplaced }] = await Promise.all([
    pool.query<ItemRow>(
      `select i.id, i.position,
              p.id as page_id, p.title as page_title, p.status as page_status,
              jsonb_array_length(p.blocks)::int as block_count,
              (select count(*) from content_page_media m where m.content_page_id = p.id)::int as picture_count,
              q.id as question_id, q.ref_no, q.stem_text, q.type as question_type, q.status as question_status
       from handbook_items i
       left join content_pages p on p.id = i.content_page_id
       left join questions q on q.id = i.question_id
       where i.chapter_id = $1
       order by i.position`,
      [chapter.id]
    ),
    // Only this chapter's questions can join its page order; each question appears once in the book.
    pool.query<QuestionRow>(
      `select q.id, q.ref_no, q.stem_text, q.type, q.status
       from questions q
       where q.chapter_id = $1 and not exists (select 1 from handbook_items i where i.question_id = q.id)
       order by q.ref_no`,
      [chapter.id]
    ),
  ]);

  const items: OrderItem[] = rows.map((row) =>
    row.page_id
      ? {
          kind: "page",
          id: row.id,
          position: row.position,
          pageId: row.page_id,
          title: row.page_title ?? "",
          status: row.page_status ?? "draft",
          summary:
            row.block_count === 0
              ? "Empty"
              : `${row.block_count} block${row.block_count === 1 ? "" : "s"}${
                  row.picture_count ? ` · ${row.picture_count} picture${row.picture_count === 1 ? "" : "s"}` : ""
                }`,
        }
      : {
          kind: "question",
          id: row.id,
          position: row.position,
          questionId: row.question_id ?? "",
          label: questionLogLabel(row.ref_no ?? 0, row.stem_text ?? ""),
          typeLabel: questionTypeLabel(row.question_type ?? "single_text"),
          status: row.question_status ?? "draft",
        }
  );
  const addable: AddableQuestion[] = unplaced.map((row) => ({
    id: row.id,
    label: questionLogLabel(row.ref_no, row.stem_text),
    typeLabel: questionTypeLabel(row.type),
    status: row.status,
  }));

  const pageCount = items.filter((item) => item.kind === "page").length;
  const questionCount = items.length - pageCount;
  const published = items.filter((item) => item.status === "published").length;
  const drafts = items.length - published;
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/admin/handbook" className="text-primary underline-offset-2 hover:underline">
          Handbook
        </Link>
        <span aria-hidden="true" className="mx-1.5 text-slate-500">/</span>
        <span className="text-slate-700">{chapter.sectionLabel}</span>
      </nav>
      <PageHeader
        title={chapter.chapterLabel}
        description={`${plural(items.length, "item")} · ${plural(pageCount, "page")} · ${plural(questionCount, "question")} · ${published} published`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/handbook/preview?chapter=${chapter.id}`} className={buttonClass("secondary")}>
              Preview chapter
            </Link>
            <AddQuestionsButton chapterId={chapter.id} questions={addable} />
            <NewPageButton chapterId={chapter.id} />
          </div>
        }
      />

      {drafts > 0 && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-600/25">
          {drafts === 1 ? "1 item is a draft. Candidates won't see it" : `${drafts} items are drafts. Candidates won't see them`} until
          {drafts === 1 ? " it's" : " they're"} published.
        </p>
      )}

      <ChapterOrder items={items} />
    </>
  );
}
