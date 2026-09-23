"use server";

import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db/pool";
import { requireRole } from "@/lib/auth/guard";

export type CategoryActionState = { error?: string; success?: boolean };

const MAX_NAME_LENGTH = 100;

export async function createCategory(
  _prevState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  await requireRole(["superadmin"]);

  const name = normaliseName(formData.get("name"));

  if (!name) {
    return { error: "Category name is required." };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Category name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  }

  const { rows: existing } = await pool.query(
    `select 1 from categories where lower(name) = lower($1)`,
    [name]
  );
  if (existing.length > 0) {
    return { error: "A category with this name already exists." };
  }

  try {
    await pool.query(`insert into categories (name) values ($1)`, [name]);
  } catch (error) {
    if (getErrorCode(error) === "23505") {
      return { error: "A category with this name already exists." };
    }
    throw error;
  }

  revalidatePath("/admin/categories");
  return { success: true };
}

export async function renameCategory(
  _prevState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  await requireRole(["superadmin"]);

  const categoryId = String(formData.get("categoryId") ?? "");
  const name = normaliseName(formData.get("name"));

  if (!name) {
    return { error: "Category name is required." };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Category name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  }

  let updatedCount: number;
  try {
    const { rows: existing } = await pool.query(
      `select 1 from categories where lower(name) = lower($1) and id <> $2`,
      [name, categoryId]
    );
    if (existing.length > 0) {
      return { error: "A category with this name already exists." };
    }
    const result = await pool.query(
      `update categories set name = $2 where id = $1`,
      [categoryId, name]
    );
    updatedCount = result.rowCount ?? 0;
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") {
      return { error: "A category with this name already exists." };
    }
    if (code === "22P02") {
      return { error: "Category not found." };
    }
    throw error;
  }

  revalidatePath("/admin/categories");
  revalidatePath("/admin/candidates");
  return updatedCount === 0
    ? { error: "This category no longer exists." }
    : { success: true };
}

export async function deleteCategory(
  _prevState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  await requireRole(["superadmin"]);

  const categoryId = String(formData.get("categoryId") ?? "");
  if (!categoryId) {
    return { error: "Category not found." };
  }

  // Single statement so a candidate added after the page loaded still blocks it.
  let deletedCount: number;
  try {
    const result = await pool.query(
      `delete from categories
       where id = $1
         and not exists (select 1 from users where category_id = $1)`,
      [categoryId]
    );
    deletedCount = result.rowCount ?? 0;
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23503") {
      return { error: blockedMessage(1) };
    }
    if (code === "22P02") {
      return { error: "Category not found." };
    }
    throw error;
  }

  if (deletedCount === 0) {
    const { rows } = await pool.query<{ count: string }>(
      `select count(*) from users where category_id = $1`,
      [categoryId]
    );
    const candidateCount = Number(rows[0]?.count ?? 0);
    revalidatePath("/admin/categories");
    return {
      error:
        candidateCount > 0
          ? blockedMessage(candidateCount)
          : "This category has already been deleted.",
    };
  }

  revalidatePath("/admin/categories");
  revalidatePath("/admin/candidates");
  return { success: true };
}

function normaliseName(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function blockedMessage(candidateCount: number) {
  return `This category still has ${candidateCount} candidate${
    candidateCount === 1 ? "" : "s"
  }. Their admins need to move them to another category before it can be deleted.`;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}
