"use server";

import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { collectMediaIds, parseBlocks } from "@/lib/content/blocks";
import type { ResolvedMedia } from "@/lib/content/book";
import { isUuid, resolveMedia } from "@/lib/content/pages";
import { getSignedUrls, isStorageConfigured } from "@/lib/storage/storage";

export type PageActionState = { error?: string; success?: boolean };
export type SaveResult = { ok: true; version: number } | { ok: false; error: string; conflict?: boolean };
export type PickerItem = { id: string; thumbUrl: string | null; alt: string; name: string; width: number; height: number };

const MAX_TITLE_LENGTH = 120;
const NOT_FOUND = "This page no longer exists.";

export async function createPage(_prev: PageActionState, formData: FormData): Promise<PageActionState> {
  const session = await requireRole(["superadmin"]);

  const chapterId = String(formData.get("chapterId") ?? "");
  const title = normaliseTitle(formData.get("title"));
  const invalid = validateTitle(title);
  if (invalid) return { error: invalid };
  if (!isUuid(chapterId)) return { error: "This chapter no longer exists." };

  const pageId = await withTransaction(async (client) => {
    await lockOrder(client);
    const { rows: chapter } = await client.query<{ title: string }>(
      `select title from chapters where id = $1 for share`,
      [chapterId]
    );
    if (chapter.length === 0) return null;
    const { rows } = await client.query<{ id: string }>(
      `insert into content_pages (chapter_id, title) values ($1, $2) returning id`,
      [chapterId, title]
    );
    await client.query(
      `insert into handbook_items (chapter_id, position, content_page_id)
       select $1, coalesce(max(position), 0) + 1, $2 from handbook_items where chapter_id = $1`,
      [chapterId, rows[0].id]
    );
    await logActivity(
      client,
      session,
      "content_page.created",
      { type: "page", id: rows[0].id, label: title },
      { chapter: chapter[0].title }
    );
    return rows[0].id;
  });
  if (!pageId) return { error: "This chapter no longer exists." };

  revalidatePath("/admin/handbook", "layout");
  redirect(`/admin/handbook/pages/${pageId}`);
}

export async function renamePage(_prev: PageActionState, formData: FormData): Promise<PageActionState> {
  const session = await requireRole(["superadmin"]);

  const pageId = String(formData.get("pageId") ?? "");
  const title = normaliseTitle(formData.get("title"));
  const invalid = validateTitle(title);
  if (invalid) return { error: invalid };
  if (!isUuid(pageId)) return { error: NOT_FOUND };

  const result = await withTransaction<PageActionState>(async (client) => {
    const { rows } = await client.query<{ title: string }>(
      `select title from content_pages where id = $1 for update`,
      [pageId]
    );
    if (!rows[0]) return { error: NOT_FOUND };
    if (rows[0].title === title) return { success: true };

    await client.query(`update content_pages set title = $2, updated_at = now() where id = $1`, [pageId, title]);
    await logActivity(
      client,
      session,
      "content_page.renamed",
      { type: "page", id: pageId, label: title },
      { from: rows[0].title, to: title }
    );
    return { success: true };
  });

  revalidatePath("/admin/handbook", "layout");
  return result;
}

export async function movePage(id: string, direction: "up" | "down"): Promise<PageActionState> {
  const session = await requireRole(["superadmin"]);

  const pageId = String(id ?? "");
  if (!isUuid(pageId) || (direction !== "up" && direction !== "down")) return { error: NOT_FOUND };

  const result = await withTransaction<PageActionState>(async (client) => {
    await lockOrder(client);
    const { rows } = await client.query<{ id: string; chapter_id: string; position: number; title: string }>(
      `select i.id, i.chapter_id, i.position, p.title
       from handbook_items i join content_pages p on p.id = i.content_page_id
       where i.content_page_id = $1`,
      [pageId]
    );
    const item = rows[0];
    if (!item) return { error: NOT_FOUND };

    const to = direction === "up" ? item.position - 1 : item.position + 1;
    const { rows: neighbours } = await client.query<{ id: string }>(
      `select id from handbook_items where chapter_id = $1 and position = $2`,
      [item.chapter_id, to]
    );
    if (!neighbours[0]) {
      return { error: direction === "up" ? "This page is already first." : "This page is already last." };
    }
    await client.query(
      `update handbook_items set position = case when id = $1 then $3::int else $4::int end where id in ($1, $2)`,
      [item.id, neighbours[0].id, to, item.position]
    );
    await logActivity(
      client,
      session,
      "content_page.reordered",
      { type: "page", id: pageId, label: item.title },
      { from: `Position ${item.position}`, to: `Position ${to}` }
    );
    return { success: true };
  });

  revalidatePath("/admin/handbook", "layout");
  return result;
}

export async function setPageStatus(id: string, status: "draft" | "published"): Promise<PageActionState> {
  const session = await requireRole(["superadmin"]);

  const pageId = String(id ?? "");
  if (!isUuid(pageId) || (status !== "draft" && status !== "published")) return { error: NOT_FOUND };

  const result = await withTransaction<PageActionState>(async (client) => {
    const { rows } = await client.query<{ title: string; status: string; blocks: unknown }>(
      `select title, status, blocks from content_pages where id = $1 for update`,
      [pageId]
    );
    const page = rows[0];
    if (!page) return { error: NOT_FOUND };
    if (page.status === status) return { success: true };

    if (status === "published") {
      // Only content that passes today's checks can be published.
      const parsed = parseBlocks(page.blocks);
      if (!parsed.ok) return { error: `This page can't be published yet. ${parsed.error}` };
      if (parsed.blocks.length === 0) return { error: "An empty page can't be published. Add some content first." };
    }

    await client.query(`update content_pages set status = $2, updated_at = now() where id = $1`, [pageId, status]);
    await logActivity(
      client,
      session,
      status === "published" ? "content_page.published" : "content_page.unpublished",
      { type: "page", id: pageId, label: page.title }
    );
    return { success: true };
  });

  revalidatePath("/admin/handbook", "layout");
  return result;
}

export async function deletePage(_prev: PageActionState, formData: FormData): Promise<PageActionState> {
  const session = await requireRole(["superadmin"]);

  const pageId = String(formData.get("pageId") ?? "");
  if (!isUuid(pageId)) return { error: NOT_FOUND };

  const result = await withTransaction<PageActionState>(async (client) => {
    await lockOrder(client);
    const { rows } = await client.query<{ chapter_id: string; position: number }>(
      `select chapter_id, position from handbook_items where content_page_id = $1`,
      [pageId]
    );
    const { rows: deleted } = await client.query<{ title: string; chapter_title: string }>(
      `delete from content_pages p where p.id = $1
       returning p.title, (select title from chapters where id = p.chapter_id) as chapter_title`,
      [pageId]
    );
    if (!deleted[0]) return { error: "This page has already been deleted." };
    if (rows[0]) {
      await client.query(
        `update handbook_items set position = position - 1 where chapter_id = $1 and position > $2`,
        [rows[0].chapter_id, rows[0].position]
      );
    }
    await logActivity(
      client,
      session,
      "content_page.deleted",
      { type: "page", id: pageId, label: deleted[0].title },
      { chapter: deleted[0].chapter_title ?? "" }
    );
    return { success: true };
  });

  revalidatePath("/admin/handbook", "layout");
  revalidatePath("/admin/media");
  return result;
}

// Saves the editor's title and blocks. Refuses if someone else saved since this editor loaded.
export async function savePageContent(input: {
  pageId: string;
  expectedVersion: number;
  title: string;
  blocks: unknown;
}): Promise<SaveResult> {
  const session = await requireRole(["superadmin"]);

  const pageId = String(input?.pageId ?? "");
  const expectedVersion = Number(input?.expectedVersion);
  if (!isUuid(pageId) || !Number.isInteger(expectedVersion)) return { ok: false, error: NOT_FOUND };

  const title = normaliseTitle(input.title);
  const invalidTitle = validateTitle(title);
  if (invalidTitle) return { ok: false, error: invalidTitle };

  const parsed = parseBlocks(input.blocks);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const mediaIds = collectMediaIds(parsed.blocks);

  let result: SaveResult;
  try {
    result = await withTransaction<SaveResult>(async (client) => {
      const { rows } = await client.query<{ content_version: number; title: string }>(
        `select content_version, title from content_pages where id = $1 for update`,
        [pageId]
      );
      if (!rows[0]) return { ok: false, error: NOT_FOUND };
      if (rows[0].content_version !== expectedVersion) {
        return {
          ok: false,
          conflict: true,
          error: "Someone else saved this page while you were editing. Copy anything you need, then reload the page.",
        };
      }

      if (mediaIds.length > 0) {
        // FOR SHARE keeps these pictures from being deleted until this save commits.
        const { rows: found } = await client.query(`select id from media where id = any($1::uuid[]) for share`, [mediaIds]);
        if (found.length !== mediaIds.length) {
          return { ok: false, error: "A picture on this page was deleted from Media. Choose another picture and save again." };
        }
      }

      const { rows: saved } = await client.query<{ content_version: number }>(
        `update content_pages
         set title = $2,
             content_version = content_version + (case when blocks = $3::jsonb then 0 else 1 end),
             blocks = $3::jsonb,
             updated_at = now()
         where id = $1
         returning content_version`,
        [pageId, title, JSON.stringify(parsed.blocks)]
      );
      await client.query(`delete from content_page_media where content_page_id = $1`, [pageId]);
      if (mediaIds.length > 0) {
        await client.query(
          `insert into content_page_media (content_page_id, media_id) select $1::uuid, unnest($2::uuid[])`,
          [pageId, mediaIds]
        );
      }
      // A rename and a content change in one save are logged as two entries.
      const target = { type: "page" as const, id: pageId, label: title };
      if (rows[0].title !== title) {
        await logActivity(client, session, "content_page.renamed", target, { from: rows[0].title, to: title });
      }
      if (saved[0].content_version !== expectedVersion) {
        await logActivity(client, session, "content_page.updated", target, {
          from: `Version ${expectedVersion}`,
          to: `Version ${saved[0].content_version}`,
        });
      }
      return { ok: true, version: saved[0].content_version };
    });
  } catch (error) {
    if (getErrorCode(error) === "23503") {
      return { ok: false, error: "A picture on this page was deleted from Media. Choose another picture and save again." };
    }
    throw error;
  }

  if (!result.ok) return result;
  revalidatePath("/admin/handbook", "layout");
  revalidatePath("/admin/media");
  return result;
}

// Thumbnails for the picture picker, newest first.
export async function listPickerMedia(search: string): Promise<PickerItem[]> {
  await requireRole(["superadmin"]);

  const term = String(search ?? "").trim().slice(0, 100).replace(/[\\%_]/g, (match) => `\\${match}`);
  const { rows } = await pool.query<{ id: string; thumb_path: string; alt_text: string; original_name: string; width: number; height: number }>(
    `select id, thumb_path, alt_text, original_name, width, height
     from media
     where $1 = '' or alt_text ilike '%' || $1 || '%' escape '\\' or original_name ilike '%' || $1 || '%' escape '\\'
     order by created_at desc
     limit 60`,
    [term]
  );
  let thumbs = new Map<string, string>();
  if (isStorageConfigured() && rows.length > 0) {
    try {
      thumbs = await getSignedUrls(
        rows.map((row) => row.thumb_path),
        60 * 60
      );
    } catch (error) {
      console.error("Picture picker: could not create links", error);
    }
  }
  return rows.map((row) => ({
    id: row.id,
    thumbUrl: thumbs.get(row.thumb_path) ?? null,
    alt: row.alt_text,
    name: row.original_name,
    width: row.width,
    height: row.height,
  }));
}

// Full-size picture links for the live preview, after a picture is chosen in the editor.
export async function getPreviewMedia(mediaIds: string[]): Promise<ResolvedMedia> {
  await requireRole(["superadmin"]);
  const ids = Array.isArray(mediaIds) ? mediaIds.map(String).slice(0, 60) : [];
  try {
    return await resolveMedia(ids);
  } catch (error) {
    console.error("Preview pictures could not be loaded", error);
    return {};
  }
}

// Serialises changes to page order; reads are not blocked.
async function lockOrder(client: PoolClient) {
  await client.query(`lock table handbook_items in share row exclusive mode`);
}

function normaliseTitle(value: FormDataEntryValue | string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function validateTitle(title: string): string | null {
  if (!title) return "Page title is required.";
  if (title.length > MAX_TITLE_LENGTH) return `Page title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  return null;
}
