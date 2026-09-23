"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db/pool";
import { requireRole } from "@/lib/auth/guard";

export type CreateAdminState = { error?: string; success?: boolean };

export async function createAdmin(
  _prevState: CreateAdminState,
  formData: FormData
): Promise<CreateAdminState> {
  // Defense in depth: the page already gates this route, but a Server
  // Action is its own callable endpoint and must not trust that.
  await requireRole(["superadmin"]);

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 8) {
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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
