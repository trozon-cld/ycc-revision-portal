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
  await requireRole(["admin"]);

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
         (email, password_hash, role, category_id, access_start_at, access_expires_at, is_blocked)
       values
         ($1, $2, 'candidate', $3, now(), now() + interval '${ACCESS_DURATION_DAYS} days', false)`,
      [email, passwordHash, categoryId]
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
