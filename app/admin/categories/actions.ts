"use server";

import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";

export type CategoryActionState = { error?: string; success?: boolean };

const MAX_NAME_LENGTH = 100;
const DUPLICATE_NAME = "A category with this name already exists.";

export async function createCategory(
  _prevState: CategoryActionState,
  formData: FormData
): Promise<CategoryActionState> {
  const session = await requireRole(["superadmin"]);

  const name = normaliseName(formData.get("name"));
  const invalid = validateName(name);
  if (invalid) return { error: invalid };

  try {
    const result = await withTransaction<CategoryActionState>(async (client) => {
      if (await nameTaken(client, name, null)) return { error: DUPLICATE_NAME };

      const { rows } = await client.query<{ id: string }>(
        `insert into categories (name) values ($1) returning id`,
        [name]
      );
      await logActivity(client, session, "category.created", {
        type: "category",
        id: rows[0].id,
        label: name,
      });
      return { success: true };
    });
    if (result.error) return result;
  } catch (error) {
    if (getErrorCode(error) === "23505") return { error: DUPLICATE_NAME };
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
        `select count(*)::int as count from users where category_id = $1`,
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

async function lockCategory(client: PoolClient, categoryId: string) {
  const { rows } = await client.query<{ name: string }>(
    `select name from categories where id = $1 for update`,
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

function blockedMessage(candidateCount: number) {
  return `This category still has ${candidateCount} candidate${
    candidateCount === 1 ? "" : "s"
  }. Their admins need to move them to another category before it can be deleted.`;
}
