"use server";

import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { isUuid } from "@/lib/content/pages";

export type CategoryActionState = { error?: string; success?: boolean };

const MAX_NAME_LENGTH = 100;
const DUPLICATE_NAME = "A category with this name already exists.";
const MAX_LINKED_CHAPTERS = 1000;
const GROUP_GONE = "That group no longer exists. Close this and try again.";
const COVER_PICTURE_GONE = "That picture is no longer in the Media library. Choose another one.";
const CHAPTERS_CHANGED = "The chapter list has changed since you opened this. Close it, reopen and try again.";

export async function createCategory(
  _prevState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const session = await requireRole(["superadmin"]);

  const name = normaliseName(formData.get("name"));
  const groupId = String(formData.get("groupId") ?? "");
  const invalid = validateName(name);
  if (invalid) return { error: invalid };
  if (!groupId) return { error: "Choose a group." };

  try {
    const result = await withTransaction<CategoryActionState>(async (client) => {
      if (await nameTaken(client, name, null)) return { error: DUPLICATE_NAME };

      const { rows: groups } = await client.query<{ name: string }>(
        `select name from category_groups where id = $1 for key share`,
        [groupId]
      );
      if (!groups[0]) return { error: GROUP_GONE };

      const { rows } = await client.query<{ id: string }>(
        `insert into categories (name, group_id) values ($1, $2) returning id`,
        [name, groupId]
      );
      await logActivity(
        client,
        session,
        "category.created",
        { type: "category", id: rows[0].id, label: name },
        { group: groups[0].name }
      );
      return { success: true };
    });
    if (result.error) return result;
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_NAME };
    if (code === "22P02" || code === "23503") return { error: GROUP_GONE };
    throw error;
  }

  revalidatePath("/admin/categories");
  return { success: true };
}

export async function renameCategory(
  _prevState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const session = await requireRole(["superadmin"]);

  const categoryId = String(formData.get("categoryId") ?? "");
  const name = normaliseName(formData.get("name"));
  const invalid = validateName(name);
  if (invalid) return { error: invalid };

  let result: CategoryActionState;
  try {
    result = await withTransaction<CategoryActionState>(async (client) => {
      const category = await lockCategory(client, categoryId);
      if (!category) return { error: "This category no longer exists." };
      if (category.name === name) return { success: true };
      if (await nameTaken(client, name, categoryId)) return { error: DUPLICATE_NAME };

      await client.query(`update categories set name = $2 where id = $1`, [categoryId, name]);
      await logActivity(
        client,
        session,
        "category.renamed",
        { type: "category", id: categoryId, label: name },
        { from: category.name, to: name }
      );
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_NAME };
    if (code === "22P02") return { error: "Category not found." };
    throw error;
  }

  revalidatePath("/admin/categories");
  revalidatePath("/admin/candidates");
  return result;
}

export async function deleteCategory(
  _prevState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const session = await requireRole(["superadmin"]);

  const categoryId = String(formData.get("categoryId") ?? "");
  if (!categoryId) {
    return { error: "Category not found." };
  }

  let result: CategoryActionState;
  try {
    // The row lock makes the candidate count final: new candidates in this category must wait.
    result = await withTransaction<CategoryActionState>(async (client) => {
      const category = await lockCategory(client, categoryId);
      if (!category) return { error: "This category has already been deleted." };

      const { rows } = await client.query<{ count: number }>(
        `select count(*)::int as count from users where category_id = $1 or current_category_id = $1`,
        [categoryId]
      );
      if (rows[0].count > 0) return { error: blockedMessage(rows[0].count) };

      await client.query(`delete from categories where id = $1`, [categoryId]);
      await logActivity(client, session, "category.deleted", {
        type: "category",
        id: categoryId,
        label: category.name,
      });
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23503") return { error: blockedMessage(1) };
    if (code === "22P02") return { error: "Category not found." };
    throw error;
  }

  revalidatePath("/admin/categories");
  revalidatePath("/admin/candidates");
  return result;
}

// Blocked while any candidate has the category, because candidates only switch within their group.
export async function moveCategoryToGroup(
  _prevState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const session = await requireRole(["superadmin"]);

  const categoryId = String(formData.get("categoryId") ?? "");
  const groupId = String(formData.get("groupId") ?? "");
  if (!categoryId) return { error: "Category not found." };
  if (!groupId) return { error: "Choose a group." };

  let result: CategoryActionState;
  try {
    result = await withTransaction<CategoryActionState>(async (client) => {
      const category = await lockCategory(client, categoryId);
      if (!category) return { error: "This category no longer exists." };
      if (category.group_id === groupId) return { success: true };

      const { rows: counts } = await client.query<{ count: number }>(
        `select count(*)::int as count from users where category_id = $1 or current_category_id = $1`,
        [categoryId]
      );
      if (counts[0].count > 0) return { error: moveBlockedMessage(counts[0].count) };

      const { rows: groups } = await client.query<{ id: string; name: string }>(
        `select id, name from category_groups where id in ($1, $2) for key share`,
        [category.group_id, groupId]
      );
      const from = groups.find((group) => group.id === category.group_id);
      const to = groups.find((group) => group.id === groupId);
      if (!to) return { error: GROUP_GONE };

      await client.query(`update categories set group_id = $2 where id = $1`, [categoryId, groupId]);
      await logActivity(
        client,
        session,
        "category.group_changed",
        { type: "category", id: categoryId, label: category.name },
        { from: from?.name ?? "", to: to.name }
      );
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23514") return { error: moveBlockedMessage(1) };
    if (code === "22P02" || code === "23503") return { error: GROUP_GONE };
    throw error;
  }

  revalidatePath("/admin/categories");
  revalidatePath("/admin/candidates");
  return result;
}

// Replaces the whole chapter list.
export async function saveCategoryChapters(
  _prevState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const session = await requireRole(["superadmin"]);

  const categoryId = String(formData.get("categoryId") ?? "");
  const chapterIds = [...new Set(formData.getAll("chapterId").map(String))];
  if (!categoryId) return { error: "Category not found." };
  if (chapterIds.length > MAX_LINKED_CHAPTERS) return { error: "Too many chapters selected." };

  let result: CategoryActionState;
  try {
    result = await withTransaction<CategoryActionState>(async (client) => {
      const category = await lockCategory(client, categoryId);
      if (!category) return { error: "This category no longer exists." };

      // FOR SHARE keeps these chapters from being deleted until this save commits.
      const { rows } = await client.query(`select id from chapters where id = any($1::uuid[]) for share`, [
        chapterIds,
      ]);
      if (rows.length !== chapterIds.length) return { error: CHAPTERS_CHANGED };

      const { rows: removed } = await client.query<{ chapter_id: string }>(
        `delete from category_chapters where category_id = $1 returning chapter_id`,
        [categoryId]
      );
      await client.query(
        `insert into category_chapters (category_id, chapter_id) select $1::uuid, unnest($2::uuid[])`,
        [categoryId, chapterIds]
      );

      const before = new Set(removed.map((row) => row.chapter_id));
      const added = chapterIds.filter((id) => !before.has(id)).length;
      const dropped = [...before].filter((id) => !chapterIds.includes(id)).length;
      if (added > 0 || dropped > 0) {
        await logActivity(
          client,
          session,
          "category.chapters_changed",
          { type: "category", id: categoryId, label: category.name },
          { added: String(added), removed: String(dropped), total: String(chapterIds.length) }
        );
      }
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "22P02" || code === "23503") return { error: CHAPTERS_CHANGED };
    throw error;
  }

  revalidatePath("/admin/categories");
  return result;
}

// Both covers are saved together; an empty value means the standard brand cover.
export async function saveCategoryCovers(
  _prevState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const session = await requireRole(["superadmin"]);

  const categoryId = String(formData.get("categoryId") ?? "");
  const frontId = String(formData.get("frontMediaId") ?? "") || null;
  const backId = String(formData.get("backMediaId") ?? "") || null;
  if (!isUuid(categoryId)) return { error: "Category not found." };
  if ((frontId && !isUuid(frontId)) || (backId && !isUuid(backId))) return { error: COVER_PICTURE_GONE };

  let result: CategoryActionState;
  try {
    result = await withTransaction<CategoryActionState>(async (client) => {
      const { rows } = await client.query<{
        name: string;
        front_id: string | null;
        back_id: string | null;
        front_name: string | null;
        back_name: string | null;
      }>(
        `select c.name, c.front_cover_media_id as front_id, c.back_cover_media_id as back_id,
                fm.original_name as front_name, bm.original_name as back_name
         from categories c
         left join media fm on fm.id = c.front_cover_media_id
         left join media bm on bm.id = c.back_cover_media_id
         where c.id = $1
         for update of c`,
        [categoryId]
      );
      const category = rows[0];
      if (!category) return { error: "This category no longer exists." };
      if (category.front_id === frontId && category.back_id === backId) return { success: true };

      // FOR KEY SHARE keeps the chosen pictures from being deleted until this save commits.
      const wanted = [frontId, backId].filter((id): id is string => Boolean(id));
      const { rows: pictures } = await client.query<{ id: string; original_name: string }>(
        `select id, original_name from media where id = any($1::uuid[]) for key share`,
        [wanted]
      );
      const nameOf = new Map(pictures.map((picture) => [picture.id, picture.original_name]));
      if (wanted.some((id) => !nameOf.has(id))) return { error: COVER_PICTURE_GONE };

      await client.query(
        `update categories set front_cover_media_id = $2, back_cover_media_id = $3 where id = $1`,
        [categoryId, frontId, backId]
      );
      const details: Record<string, string> = {};
      if (category.front_id !== frontId) {
        details.frontCover = describeCoverChange(category.front_name, frontId ? nameOf.get(frontId)! : null);
      }
      if (category.back_id !== backId) {
        details.backCover = describeCoverChange(category.back_name, backId ? nameOf.get(backId)! : null);
      }
      await logActivity(
        client,
        session,
        "category.covers_changed",
        { type: "category", id: categoryId, label: category.name },
        details
      );
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "22P02" || code === "23503") return { error: COVER_PICTURE_GONE };
    throw error;
  }

  revalidatePath("/admin/categories");
  revalidatePath("/admin/media");
  return result;
}

function describeCoverChange(before: string | null, after: string | null): string {
  if (!after) return `Standard cover (was “${before ?? "a picture"}”)`;
  return before ? `“${after}” (was “${before}”)` : `“${after}”`;
}

async function lockCategory(client: PoolClient, categoryId: string) {
  const { rows } = await client.query<{ name: string; group_id: string }>(
    `select name, group_id from categories where id = $1 for update`,
    [categoryId]
  );
  return rows[0];
}

async function nameTaken(client: PoolClient, name: string, exceptId: string | null) {
  const { rows } = await client.query(
    `select 1 from categories where lower(name) = lower($1) and ($2::uuid is null or id <> $2::uuid)`,
    [name, exceptId]
  );
  return rows.length > 0;
}

function normaliseName(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function validateName(name: string): string | null {
  if (!name) return "Category name is required.";
  if (name.length > MAX_NAME_LENGTH) {
    return `Category name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }
  return null;
}

function moveBlockedMessage(candidateCount: number) {
  return `This category has ${candidateCount} candidate${
    candidateCount === 1 ? "" : "s"
  }. Candidates can only switch within their group, so it can't move while they use it.`;
}

function blockedMessage(candidateCount: number) {
  return `This category still has ${candidateCount} candidate${
    candidateCount === 1 ? "" : "s"
  }. Their admins need to move them to another category before it can be deleted.`;
}
