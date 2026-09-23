"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db/pool";
import { requireRole } from "@/lib/auth/guard";

export type CreateCandidateState = { error?: string; success?: boolean };

const ACCESS_DURATION_DAYS = 30;

export async function createCandidate(
  _prevState: CreateCandidateState,
  formData: FormData
): Promise<CreateCandidateState> {
  // Owner always comes from the session, never the form.
  const session = await requireRole(["admin"]);

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");

  if (!email || !password || !categoryId) {
    return { error: "Email, password, and category are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await pool.query(
      `insert into users
         (email, password_hash, role, category_id, admin_id, access_start_at, access_expires_at, is_blocked)
       values
         ($1, $2, 'candidate', $3, $4, now(), now() + interval '${ACCESS_DURATION_DAYS} days', false)`,
      [email, passwordHash, categoryId, session.sub]
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "An account with this email already exists." };
    }
    if (isForeignKeyViolation(error)) {
      return { error: "Selected category is invalid." };
    }
    throw error;
  }

  revalidatePath("/admin/candidates");
  return { success: true };
}

function isUniqueViolation(error: unknown): boolean {
  return getErrorCode(error) === "23505";
}

function isForeignKeyViolation(error: unknown): boolean {
  return getErrorCode(error) === "23503";
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

export type ChangeAdminState = { error?: string; success?: boolean };

export async function changeCandidateAdmin(
  _prevState: ChangeAdminState,
  formData: FormData
): Promise<ChangeAdminState> {
  await requireRole(["superadmin"]);

  const candidateId = String(formData.get("candidateId") ?? "");
  const adminId = String(formData.get("adminId") ?? "");

  if (!candidateId || !adminId) {
    return { error: "Choose an admin." };
  }

  // Both roles are checked in SQL so a forged id can't move a candidate to a non-admin.
  let updatedCount: number;
  try {
    const result = await pool.query(
      `update users set admin_id = $2
       where id = $1
         and role = 'candidate'
         and exists (select 1 from users where id = $2 and role = 'admin')`,
      [candidateId, adminId]
    );
    updatedCount = result.rowCount ?? 0;
  } catch (error) {
    if (getErrorCode(error) === "22P02") {
      return { error: "Candidate or admin not found." };
    }
    throw error;
  }

  if (updatedCount === 0) {
    revalidatePath("/admin/candidates");
    return { error: "Candidate or admin not found. The page has been refreshed." };
  }

  revalidatePath("/admin/candidates");
  revalidatePath("/admin/admins");
  return { success: true };
}
