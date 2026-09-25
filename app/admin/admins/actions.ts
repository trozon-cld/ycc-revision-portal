"use server";

import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";

export type CreateAdminState = { error?: string; success?: boolean };
export type AdminActionState = { error?: string; success?: boolean };

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUPLICATE_EMAIL = "An account with this email already exists.";
const NOT_FOUND = "Admin not found.";

export async function createAdmin(
  _prevState: CreateAdminState,
  formData: FormData
): Promise<CreateAdminState> {
  const session = await requireRole(["superadmin"]);

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: "Password must be at least 8 characters." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into users (email, password_hash, role, access_start_at, access_expires_at, is_blocked)
         values ($1, $2, 'admin', null, null, false)
         returning id`,
        [email, passwordHash]
      );
      await logActivity(client, session, "admin.created", {
        type: "admin",
        id: rows[0].id,
        label: email,
      });
    });
  } catch (error) {
    if (getErrorCode(error) === "23505") {
      return { error: DUPLICATE_EMAIL };
    }
    throw error;
  }

  revalidatePath("/admin/admins");
  return { success: true };
}

// Every query below is pinned to role = 'admin', so these actions can
// never touch the Superadmin or a candidate even with a forged adminId.

export async function updateAdminEmail(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const session = await requireRole(["superadmin"]);

  const adminId = String(formData.get("adminId") ?? "");
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }

  try {
    const result = await withTransaction<AdminActionState>(async (client) => {
      const admin = await lockAdmin(client, adminId);
      if (!admin) return { error: NOT_FOUND };
      if (admin.email === email) return { success: true };

      await client.query(`update users set email = $2 where id = $1`, [adminId, email]);
      await logActivity(
        client,
        session,
        "admin.email_changed",
        { type: "admin", id: adminId, label: email },
        { from: admin.email, to: email }
      );
      return { success: true };
    });
    if (result.error) return result;
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_EMAIL };
    if (code === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidatePath("/admin/admins");
  revalidatePath("/admin/candidates");
  return { success: true };
}

export async function updateAdminPassword(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const session = await requireRole(["superadmin"]);

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

  try {
    return await withTransaction<AdminActionState>(async (client) => {
      const admin = await lockAdmin(client, adminId);
      if (!admin) return { error: NOT_FOUND };

      await client.query(`update users set password_hash = $2 where id = $1`, [adminId, passwordHash]);
      await logActivity(client, session, "admin.password_changed", {
        type: "admin",
        id: adminId,
        label: admin.email,
      });
      return { success: true };
    });
  } catch (error) {
    if (getErrorCode(error) === "22P02") return { error: NOT_FOUND };
    throw error;
  }
}

export async function deleteAdmin(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const session = await requireRole(["superadmin"]);

  const adminId = String(formData.get("adminId") ?? "");

  let result: AdminActionState;
  try {
    // The row lock makes the candidate count final: new candidates for this admin must wait.
    result = await withTransaction<AdminActionState>(async (client) => {
      const admin = await lockAdmin(client, adminId);
      if (!admin) return { error: "This admin has already been deleted." };

      const { rows } = await client.query<{ count: number }>(
        `select count(*)::int as count from users where admin_id = $1`,
        [adminId]
      );
      if (rows[0].count > 0) return { error: blockedMessage(rows[0].count) };

      await client.query(`delete from users where id = $1`, [adminId]);
      await logActivity(client, session, "admin.deleted", {
        type: "admin",
        id: adminId,
        label: admin.email,
      });
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23503") return { error: blockedMessage(1) };
    if (code === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidatePath("/admin/admins");
  return result;
}

async function lockAdmin(
  client: PoolClient,
  adminId: string
): Promise<{ email: string } | undefined> {
  const { rows } = await client.query<{ email: string }>(
    `select email from users where id = $1 and role = 'admin' for update`,
    [adminId]
  );
  return rows[0];
}

function blockedMessage(candidateCount: number) {
  return `This admin still owns ${candidateCount} candidate${
    candidateCount === 1 ? "" : "s"
  }. Move them to another admin before deleting.`;
}
