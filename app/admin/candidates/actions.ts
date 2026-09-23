"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db/pool";
import { requireRole } from "@/lib/auth/guard";
import { accessEndSql, resolveAccessEndDate } from "@/lib/candidates/access";

export type CandidateActionState = { error?: string; success?: boolean };
export type CreateCandidateState = CandidateActionState;
export type ChangeAdminState = CandidateActionState;

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOT_FOUND = "Candidate not found. The page has been refreshed.";

export async function createCandidate(
  _prevState: CandidateActionState,
  formData: FormData
): Promise<CandidateActionState> {
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
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: "Password must be at least 8 characters." };
  }
  const access = resolveAccessEndDate(formData);
  if ("error" in access) {
    return { error: access.error };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await pool.query(
      `insert into users
         (email, password_hash, role, category_id, admin_id, access_start_at, access_expires_at, is_blocked)
       values
         ($1, $2, 'candidate', $3, $4, now(), ${accessEndSql("$5")}, false)`,
      [email, passwordHash, categoryId, session.sub, access.date]
    );
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") {
      return { error: "An account with this email already exists." };
    }
    if (code === "23503" || code === "22P02") {
      return { error: "Selected category is invalid." };
    }
    throw error;
  }

  revalidatePath("/admin/candidates");
  return { success: true };
}

export async function updateCandidateEmail(
  _prevState: CandidateActionState,
  formData: FormData
): Promise<CandidateActionState> {
  const session = await requireRole(["admin"]);
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }

  return updateOwnCandidate(session.sub, formData, "email = $3", [email]);
}

export async function updateCandidatePassword(
  _prevState: CandidateActionState,
  formData: FormData
): Promise<CandidateActionState> {
  const session = await requireRole(["admin"]);
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "The two passwords don't match." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  return updateOwnCandidate(session.sub, formData, "password_hash = $3", [passwordHash]);
}

export async function updateCandidateCategory(
  _prevState: CandidateActionState,
  formData: FormData
): Promise<CandidateActionState> {
  const session = await requireRole(["admin"]);
  const categoryId = String(formData.get("categoryId") ?? "");

  if (!categoryId) {
    return { error: "Choose a category." };
  }

  const result = await updateOwnCandidate(session.sub, formData, "category_id = $3", [categoryId]);
  if (result.success) {
    revalidatePath("/admin/categories");
  }
  return result;
}

export async function updateCandidateAccess(
  _prevState: CandidateActionState,
  formData: FormData
): Promise<CandidateActionState> {
  const session = await requireRole(["admin"]);
  const access = resolveAccessEndDate(formData);
  if ("error" in access) {
    return { error: access.error };
  }

  return updateOwnCandidate(session.sub, formData, `access_expires_at = ${accessEndSql("$3")}`, [
    access.date,
  ]);
}

export async function setCandidateBlocked(
  _prevState: CandidateActionState,
  formData: FormData
): Promise<CandidateActionState> {
  const session = await requireRole(["admin"]);
  const blocked = formData.get("blocked") === "true";

  return updateOwnCandidate(session.sub, formData, "is_blocked = $3", [blocked]);
}

export async function deleteCandidate(
  _prevState: CandidateActionState,
  formData: FormData
): Promise<CandidateActionState> {
  const session = await requireRole(["admin"]);
  const candidateId = String(formData.get("candidateId") ?? "");

  let deletedCount: number;
  try {
    const result = await pool.query(
      `delete from users where id = $1 and role = 'candidate' and admin_id = $2`,
      [candidateId, session.sub]
    );
    deletedCount = result.rowCount ?? 0;
  } catch (error) {
    if (getErrorCode(error) === "22P02") {
      return { error: NOT_FOUND };
    }
    throw error;
  }

  revalidatePath("/admin/candidates");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/admins");
  return deletedCount === 0 ? { error: NOT_FOUND } : { success: true };
}

export async function changeCandidateAdmin(
  _prevState: CandidateActionState,
  formData: FormData
): Promise<CandidateActionState> {
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

// Scoped to candidates owned by this admin — a forged candidateId matches no rows.
async function updateOwnCandidate(
  adminId: string,
  formData: FormData,
  setClause: string,
  values: unknown[]
): Promise<CandidateActionState> {
  const candidateId = String(formData.get("candidateId") ?? "");

  let updatedCount: number;
  try {
    const result = await pool.query(
      `update users set ${setClause}
       where id = $1 and role = 'candidate' and admin_id = $2`,
      [candidateId, adminId, ...values]
    );
    updatedCount = result.rowCount ?? 0;
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") {
      return { error: "An account with this email already exists." };
    }
    if (code === "23503") {
      return { error: "Selected category is invalid." };
    }
    if (code === "22P02") {
      return { error: NOT_FOUND };
    }
    throw error;
  }

  revalidatePath("/admin/candidates");
  return updatedCount === 0 ? { error: NOT_FOUND } : { success: true };
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}
