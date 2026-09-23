"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db/pool";
import { requireRole } from "@/lib/auth/guard";

export type CreateAdminState = { error?: string; success?: boolean };
export type AdminActionState = { error?: string; success?: boolean };

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createAdmin(
  _prevState: CreateAdminState,
  formData: FormData
): Promise<CreateAdminState> {
  await requireRole(["superadmin"]);

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: "Password must be at least 8 characters." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await pool.query(
      `insert into users (email, password_hash, role, access_start_at, access_expires_at, is_blocked)
       values ($1, $2, 'admin', null, null, false)`,
      [email, passwordHash]
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "An account with this email already exists." };
    }
    throw error;
  }

  revalidatePath("/admin/admins");
  return { success: true };
}

// Every update/delete below is pinned to role = 'admin', so these actions can
// never touch the Superadmin or a candidate even with a forged adminId.

export async function updateAdminEmail(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  await requireRole(["superadmin"]);

  const adminId = String(formData.get("adminId") ?? "");
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }

  let updatedCount: number;
  try {
    const result = await pool.query(
      `update users set email = $2 where id = $1 and role = 'admin'`,
      [adminId, email]
    );
    updatedCount = result.rowCount ?? 0;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "An account with this email already exists." };
    }
    if (isInvalidId(error)) {
      return { error: "Admin not found." };
    }
    throw error;
  }

  if (updatedCount === 0) {
    return { error: "Admin not found." };
  }

  revalidatePath("/admin/admins");
  revalidatePath("/admin/candidates");
  return { success: true };
}

export async function updateAdminPassword(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  await requireRole(["superadmin"]);

  const adminId = String(formData.get("adminId") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "The two passwords don't match." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let updatedCount: number;
  try {
    const result = await pool.query(
      `update users set password_hash = $2 where id = $1 and role = 'admin'`,
      [adminId, passwordHash]
    );
    updatedCount = result.rowCount ?? 0;
  } catch (error) {
    if (isInvalidId(error)) {
      return { error: "Admin not found." };
    }
    throw error;
  }

  if (updatedCount === 0) {
    return { error: "Admin not found." };
  }

  return { success: true };
}

export async function deleteAdmin(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  await requireRole(["superadmin"]);

  const adminId = String(formData.get("adminId") ?? "");

  // Single statement so a candidate added after the page loaded still blocks it.
  let deletedCount: number;
  try {
    const result = await pool.query(
      `delete from users
       where id = $1
         and role = 'admin'
         and not exists (select 1 from users where admin_id = $1)`,
      [adminId]
    );
    deletedCount = result.rowCount ?? 0;
  } catch (error) {
    if (getErrorCode(error) === "23503") {
      return { error: blockedMessage(1) };
    }
    if (isInvalidId(error)) {
      return { error: "Admin not found." };
    }
    throw error;
  }

  if (deletedCount === 0) {
    const { rows } = await pool.query<{ count: string }>(
      `select count(*) from users where admin_id = $1`,
      [adminId]
    );
    const candidateCount = Number(rows[0]?.count ?? 0);
    revalidatePath("/admin/admins");
    return {
      error:
        candidateCount > 0
          ? blockedMessage(candidateCount)
          : "This admin has already been deleted.",
    };
  }

  revalidatePath("/admin/admins");
  return { success: true };
}

function blockedMessage(candidateCount: number) {
  return `This admin still owns ${candidateCount} candidate${
    candidateCount === 1 ? "" : "s"
  }. Move them to another admin before deleting.`;
}

function isUniqueViolation(error: unknown): boolean {
  return getErrorCode(error) === "23505";
}

function isInvalidId(error: unknown): boolean {
  return getErrorCode(error) === "22P02";
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}
