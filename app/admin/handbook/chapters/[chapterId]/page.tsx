import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { getChapterContext } from "@/lib/content/pages";
import { Badge } from "@/components/admin/badge";
import { PageHeader } from "@/components/admin/page-header";
import { Cell, Row, Table } from "@/components/admin/table";
import { NewPageButton, PageRowActions } from "./page-row-actions";

interface PageRow {
  id: string;
  title: string;
  status: "draft" | "published";
  block_count: number;
  picture_count: number;
  updated_at: Date;
}

export default async function ChapterPagesPage({ params }: PageProps<"/admin/handbook/chapters/[chapterId]">) {
  await requireRole(["superadmin"]);
  const { chapterId } = await params;
  const chapter = await getChapterContext(chapterId);
  if (!chapter) notFound();

  const { rows: pages } = await pool.query<PageRow>(
    `select p.id, p.title, p.status, p.updated_at,
            jsonb_array_length(p.blocks)::int as block_count,
            (select count(*) from content_page_media m where m.content_page_id = p.id)::int as picture_count
     from handbook_items i
     join content_pages p on p.id = i.content_page_id
     where i.chapter_id = $1
     order by i.position`,
    [chapter.id]
  );
  const published = pages.filter((page) => page.status === "published").length;

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
        description={`${pages.length} page${pages.length === 1 ? "" : "s"} · ${published} published`}
        actions={<NewPageButton chapterId={chapter.id} />}
      />

      <Table
        columns={["Page", "Content", "Status", ""]}
        isEmpty={pages.length === 0}
        emptyMessage="No pages in this chapter yet. Add the first one."
      >
        {pages.map((page, index) => (
          <Row key={page.id}>
            <Cell kind="primary">
              <span className="mr-1 font-mono text-slate-600 tabular-nums">{index + 1}.</span>{" "}
              <Link href={`/admin/handbook/pages/${page.id}`} className="text-ink underline-offset-2 hover:text-primary hover:underline">
                {page.title}
              </Link>
            </Cell>
            <Cell label="Content" nowrap>
              {page.block_count === 0
                ? "Empty"
                : `${page.block_count} block${page.block_count === 1 ? "" : "s"}${
                    page.picture_count ? ` · ${page.picture_count} picture${page.picture_count === 1 ? "" : "s"}` : ""
                  }`}
            </Cell>
            <Cell label="Status" nowrap>
              <Badge tone={page.status === "published" ? "success" : "neutral"}>
                {page.status === "published" ? "Published" : "Draft"}
              </Badge>
            </Cell>
            <Cell kind="actions">
              <PageRowActions
                id={page.id}
                title={page.title}
                status={page.status}
                isFirst={index === 0}
                isLast={index === pages.length - 1}
              />
            </Cell>
          </Row>
        ))}
      </Table>
    </>
  );
}
