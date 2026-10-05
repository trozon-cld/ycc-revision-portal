"use server";

import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { listNames } from "@/lib/handbook/categories";
import { questionRef } from "@/lib/questions/labels";
import { isUuid } from "@/lib/questions/text";
import {
  lockHandbookStructure,
  normaliseTitle,
  validateTitle,
  type StructureActionState,
} from "@/lib/handbook/structure";

const DUPLICATE_TITLE = "A chapter with this title already exists.";
const NOT_FOUND = "This chapter no longer exists.";
const SECTION_NOT_FOUND = "The chosen section no longer exists.";
const PAGE_PATH = "/admin/handbook";
const CATEGORIES_CHANGED = "The list of categories has changed. Close this panel and open it again.";
const MAX_CATEGORIES = 500;

export async function createChapter(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);

  const sectionId = String(formData.get("sectionId") ?? "");
  const title = normaliseTitle(formData.get("title"));
  const categoryIds = categoryIdsFrom(formData);
  const invalid = validateTitle(title, "Chapter");
  if (invalid) return { error: invalid };
  if (!sectionId) return { error: "Choose a section." };
  if (categoryIds.length > MAX_CATEGORIES) return { error: "Too many categories selected." };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      await lockHandbookStructure(client);
      const sectionTitle = await sectionTitleOf(client, sectionId);
      if (!sectionTitle) return { error: SECTION_NOT_FOUND };
      if (await titleTaken(client, title, null)) return { error: DUPLICATE_TITLE };
      const categories = await lockCategories(client, categoryIds);
      if (!categories) return { error: CATEGORIES_CHANGED };

      const { rows: created } = await client.query<{ id: string }>(
        `insert into chapters (section_id, position, title)
         select $1, coalesce(max(position), 0) + 1, $2 from chapters where section_id = $1
         returning id`,
        [sectionId, title]
      );
      await client.query(
        `insert into category_chapters (category_id, chapter_id) select unnest($1::uuid[]), $2::uuid`,
        [categoryIds, created[0].id]
      );
      await logActivity(
        client,
        session,
        "chapter.created",
        { type: "chapter", id: created[0].id, label: title },
        {
          section: sectionTitle,
          ...(categoryIds.length > 0 ? { categories: listNames(categoryIds.map((id) => categories.get(id) ?? "")) } : {}),
        }
      );
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_TITLE };
    if (code === "22P02") return { error: SECTION_NOT_FOUND };
    throw error;
  }

  revalidatePath(PAGE_PATH);
  revalidatePath("/admin/categories");
  return result;
}

// Replaces the whole list of categories that include this chapter (the Categories page edits the same links).
export async function saveChapterCategories(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);

  const chapterId = String(formData.get("chapterId") ?? "");
  const categoryIds = categoryIdsFrom(formData);
  if (categoryIds.length > MAX_CATEGORIES) return { error: "Too many categories selected." };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      // Categories first, then the chapter: the same order as a save from the Categories page.
      const categories = await lockCategories(client, categoryIds);
      if (!categories) return { error: CATEGORIES_CHANGED };
      const { rows } = await client.query<{ title: string }>(`select title from chapters where id = $1 for update`, [chapterId]);
      if (!rows[0]) return { error: NOT_FOUND };

      const { rows: removed } = await client.query<{ category_id: string; name: string }>(
        `delete from category_chapters cc using categories c
         where cc.chapter_id = $1 and c.id = cc.category_id
         returning cc.category_id, c.name`,
        [chapterId]
      );
      await client.query(
        `insert into category_chapters (category_id, chapter_id) select unnest($1::uuid[]), $2::uuid`,
        [categoryIds, chapterId]
      );

      const before = new Set(removed.map((row) => row.category_id));
      const added = categoryIds.filter((id) => !before.has(id)).map((id) => categories.get(id) ?? "");
      const dropped = removed.filter((row) => !categoryIds.includes(row.category_id)).map((row) => row.name);
      if (added.length > 0 || dropped.length > 0) {
        await logActivity(
          client,
          session,
          "chapter.categories_changed",
          { type: "chapter", id: chapterId, label: rows[0].title },
          {
            ...(added.length > 0 ? { addedCategories: listNames(added.sort()) } : {}),
            ...(dropped.length > 0 ? { removedCategories: listNames(dropped.sort()) } : {}),
            categoryTotal: String(categoryIds.length),
          }
        );
      }
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "22P02") return { error: NOT_FOUND };
    if (code === "23503") return { error: CATEGORIES_CHANGED };
    throw error;
  }

  revalidatePath(PAGE_PATH, "layout");
  revalidatePath("/admin/categories");
  return result;
}

export async function renameChapter(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);

  const chapterId = String(formData.get("chapterId") ?? "");
  const title = normaliseTitle(formData.get("title"));
  const invalid = validateTitle(title, "Chapter");
  if (invalid) return { error: invalid };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      const { rows } = await client.query<{ title: string }>(
        `select title from chapters where id = $1 for update`,
        [chapterId]
      );
      if (!rows[0]) return { error: NOT_FOUND };
      if (rows[0].title === title) return { success: true };
      if (await titleTaken(client, title, chapterId)) return { error: DUPLICATE_TITLE };

      await client.query(`update chapters set title = $2, updated_at = now() where id = $1`, [chapterId, title]);
      await logActivity(
        client,
        session,
        "chapter.renamed",
        { type: "chapter", id: chapterId, label: title },
        { from: rows[0].title, to: title }
      );
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_TITLE };
    if (code === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return result;
}

// Moves within the chapter's own section; "Move to section" crosses sections.
export async function moveChapter(id: string, direction: "up" | "down"): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);

  const chapterId = String(id ?? "");
  if (direction !== "up" && direction !== "down") return { error: "Unknown direction." };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      await lockHandbookStructure(client);

      const { rows } = await client.query<{ section_id: string; position: number; title: string }>(
        `select section_id, position, title from chapters where id = $1`,
        [chapterId]
      );
      if (!rows[0]) return { error: NOT_FOUND };

      const { section_id: sectionId, position: from } = rows[0];
      const to = direction === "up" ? from - 1 : from + 1;
      const { rows: neighbours } = await client.query<{ id: string }>(
        `select id from chapters where section_id = $1 and position = $2`,
        [sectionId, to]
      );
      if (!neighbours[0]) {
        return {
          error:
            direction === "up"
              ? "This chapter is already first in its section."
              : "This chapter is already last in its section.",
        };
      }

      await client.query(
        `update chapters
         set position = case when id = $1 then $3::int else $4::int end, updated_at = now()
         where id in ($1, $2)`,
        [chapterId, neighbours[0].id, to, from]
      );
      await logActivity(
        client,
        session,
        "chapter.reordered",
        { type: "chapter", id: chapterId, label: rows[0].title },
        { from: `Position ${from}`, to: `Position ${to}` }
      );
      return { success: true };
    });
  } catch (error) {
    if (getErrorCode(error) === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return result;
}

export async function moveChapterToSection(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);

  const chapterId = String(formData.get("chapterId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  if (!sectionId) return { error: "Choose a section." };
  if (!isUuid(sectionId)) return { error: SECTION_NOT_FOUND };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      await lockHandbookStructure(client);

      const { rows } = await client.query<{ section_id: string; position: number; title: string }>(
        `select section_id, position, title from chapters where id = $1`,
        [chapterId]
      );
      if (!rows[0]) return { error: NOT_FOUND };
      if (rows[0].section_id === sectionId) return { success: true };
      const newSection = await sectionTitleOf(client, sectionId);
      if (!newSection) return { error: SECTION_NOT_FOUND };
      const oldSection = await sectionTitleOf(client, rows[0].section_id);

      await client.query(
        `update chapters
         set section_id = $2,
             position = (select coalesce(max(position), 0) + 1 from chapters where section_id = $2),
             updated_at = now()
         where id = $1`,
        [chapterId, sectionId]
      );
      await closeGap(client, rows[0].section_id, rows[0].position);
      await logActivity(
        client,
        session,
        "chapter.section_changed",
        { type: "chapter", id: chapterId, label: rows[0].title },
        { from: oldSection ?? "", to: newSection }
      );
      return { success: true };
    });
  } catch (error) {
    if (getErrorCode(error) === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return result;
}

export async function deleteChapter(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);

  const chapterId = String(formData.get("chapterId") ?? "");
  if (!chapterId) return { error: NOT_FOUND };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      await lockHandbookStructure(client);

      const { rows } = await client.query<{ section_id: string; position: number; title: string }>(
        `delete from chapters where id = $1 returning section_id, position, title`,
        [chapterId]
      );
      if (!rows[0]) return { error: "This chapter has already been deleted." };

      await closeGap(client, rows[0].section_id, rows[0].position);
      await logActivity(
        client,
        session,
        "chapter.deleted",
        { type: "chapter", id: chapterId, label: rows[0].title },
        { section: (await sectionTitleOf(client, rows[0].section_id)) ?? "" }
      );
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "22P02") return { error: NOT_FOUND };
    if (code === "23503") {
      return { error: "This chapter still has pages or questions. Remove them before deleting it." };
    }
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return result;
}

// Publish: the chapter needs at least one item, and every item must be published. Unpublish: always.
// Later edits don't unpublish it; candidates only ever see published items in published chapters.
export async function setChapterStatus(id: string, status: "draft" | "published"): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);
  const chapterId = String(id ?? "");
  if (!isUuid(chapterId) || (status !== "draft" && status !== "published")) return { error: NOT_FOUND };

  const result = await withTransaction<StructureActionState>(async (client) => {
    const { rows } = await client.query<{ title: string; status: string }>(
      `select title, status from chapters where id = $1 for update`,
      [chapterId]
    );
    const chapter = rows[0];
    if (!chapter) return { error: NOT_FOUND };
    if (chapter.status === status) return { success: true };

    let itemCount = 0;
    if (status === "published") {
      // Holds the page order still while the items are checked.
      await client.query(`lock table handbook_items in share mode`);
      const { rows: items } = await client.query<{ status: string; title: string | null; ref_no: number | null }>(
        `select coalesce(p.status, q.status)::text as status, p.title, q.ref_no
         from handbook_items i
         left join content_pages p on p.id = i.content_page_id
         left join questions q on q.id = i.question_id
         where i.chapter_id = $1
         order by i.position`,
        [chapterId]
      );
      if (items.length === 0) return { error: "This chapter can't be published yet. Add at least one page or question first." };
      const drafts = items.filter((item) => item.status !== "published");
      if (drafts.length > 0) {
        const names = drafts.map((item) => (item.ref_no !== null ? questionRef(item.ref_no) : `"${item.title}"`));
        const shown = names.slice(0, 5).join(", ") + (names.length > 5 ? ` and ${names.length - 5} more` : "");
        return {
          error: `This chapter can't be published yet. ${drafts.length === 1 ? "1 item is" : `${drafts.length} items are`} still ${drafts.length === 1 ? "a draft" : "drafts"}: ${shown}.`,
        };
      }
      itemCount = items.length;
    }

    await client.query(`update chapters set status = $2, updated_at = now() where id = $1`, [chapterId, status]);
    await logActivity(
      client,
      session,
      status === "published" ? "chapter.published" : "chapter.unpublished",
      { type: "chapter", id: chapterId, label: chapter.title },
      status === "published" ? { items: `${itemCount} ${itemCount === 1 ? "item" : "items"}` } : {}
    );
    return { success: true };
  });

  revalidatePath(PAGE_PATH, "layout");
  return result;
}

export async function publishChapterForm(_prev: StructureActionState, formData: FormData): Promise<StructureActionState> {
  return setChapterStatus(String(formData.get("chapterId") ?? ""), "published");
}

export async function unpublishChapterForm(_prev: StructureActionState, formData: FormData): Promise<StructureActionState> {
  return setChapterStatus(String(formData.get("chapterId") ?? ""), "draft");
}

function categoryIdsFrom(formData: FormData): string[] {
  return [...new Set(formData.getAll("categoryId").map(String))];
}

// Keeps the chosen categories from being deleted until the save commits; null if any is gone.
async function lockCategories(client: PoolClient, ids: string[]): Promise<Map<string, string> | null> {
  if (ids.length === 0) return new Map();
  if (!ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) return null;
  const { rows } = await client.query<{ id: string; name: string }>(
    `select id, name from categories where id = any($1::uuid[]) order by id for share`,
    [ids]
  );
  return rows.length === ids.length ? new Map(rows.map((row) => [row.id, row.name])) : null;
}

async function closeGap(client: PoolClient, sectionId: string, removedPosition: number) {
  await client.query(
    `update chapters set position = position - 1, updated_at = now() where section_id = $1 and position > $2`,
    [sectionId, removedPosition]
  );
}

async function sectionTitleOf(client: PoolClient, sectionId: string): Promise<string | undefined> {
  const { rows } = await client.query<{ title: string }>(`select title from sections where id = $1`, [sectionId]);
  return rows[0]?.title;
}

async function titleTaken(client: PoolClient, title: string, exceptId: string | null) {
  const { rows } = await client.query(
    `select 1 from chapters where lower(title) = lower($1) and ($2::uuid is null or id <> $2::uuid)`,
    [title, exceptId]
  );
  return rows.length > 0;
}
