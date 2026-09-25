import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { collectMediaIds, parseBlocks } from "@/lib/content/blocks";
import type { ResolvedMedia } from "@/lib/content/book";
import { getChapterContext, isUuid, resolveMedia } from "@/lib/content/pages";
import { isStorageConfigured } from "@/lib/storage/storage";
import { PageEditor } from "./page-editor";

export default async function EditPagePage({ params }: PageProps<"/admin/handbook/pages/[pageId]">) {
  await requireRole(["superadmin"]);
  const { pageId } = await params;
  if (!isUuid(pageId)) notFound();

  const { rows } = await pool.query<{
    id: string;
    chapter_id: string;
    title: string;
    blocks: unknown;
    content_version: number;
    status: "draft" | "published";
  }>(`select id, chapter_id, title, blocks, content_version, status from content_pages where id = $1`, [pageId]);
  const page = rows[0];
  if (!page) notFound();

  const chapter = await getChapterContext(page.chapter_id);
  if (!chapter) notFound();

  // Saved content was checked on save; if the rules tightened since, show what still passes.
  const parsed = parseBlocks(page.blocks);
  const blocks = parsed.ok ? parsed.blocks : [];
  const loadProblem = parsed.ok ? null : parsed.error;

  let media: ResolvedMedia = {};
  try {
    media = await resolveMedia(collectMediaIds(blocks));
  } catch (error) {
    console.error("Editor: pictures could not be loaded", error);
  }

  return (
    <PageEditor
      pageId={page.id}
      initialTitle={page.title}
      initialBlocks={blocks}
      initialVersion={page.content_version}
      status={page.status}
      chapter={chapter}
      initialMedia={media}
      storageReady={isStorageConfigured()}
      loadProblem={loadProblem}
    />
  );
}
