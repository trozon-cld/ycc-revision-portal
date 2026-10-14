"use server";

import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { NO_NAME, normaliseName, validateName } from "@/lib/users/name";
import { BCRYPT_COST, DUPLICATE_EMAIL, EMAIL_PATTERN, EMAIL_TOO_LONG, isPasswordTooLong, MAX_EMAIL_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_TOO_LONG } from "@/lib/users/credentials";
import type { FormState } from "@/lib/forms";
import { isUuid } from "@/lib/ids";

export type AdminActionState = FormState;

const NOT_FOUND = "Admin not found.";

export async function createAdmin(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const session = await requireRole(["superadmin"]);

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = normaliseName(formData.get("name"));

  const invalidName = validateName(name);
  if (invalidName) return { error: invalidName };
  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (email.length > MAX_EMAIL_LENGTH) {
    return { error: EMAIL_TOO_LONG };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (isPasswordTooLong(password)) {
    return { error: PASSWORD_TOO_LONG };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into users (email, password_hash, role, access_start_at, access_expires_at, is_blocked, full_name)
         values ($1, $2, 'admin', null, null, false, $3)
         returning id`,
        [email, passwordHash, name]
      );
      await logActivity(client, session, "admin.created", { type: "admin", id: rows[0].id, label: email }, { name });
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

export async function updateAdminName(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const session = await requireRole(["superadmin"]);
  const adminId = String(formData.get("adminId") ?? "");
  const name = normaliseName(formData.get("name"));
  const invalid = validateName(name);
  if (invalid) return { error: invalid };

  try {
    const result = await withTransaction<AdminActionState>(async (client) => {
      const admin = await lockAdmin(client, adminId);
      if (!admin) return { error: NOT_FOUND };
      if (admin.full_name === name) return { success: true };

      await client.query(`update users set full_name = $2 where id = $1`, [adminId, name]);
      await logActivity(
        client,
        session,
        "admin.name_changed",
        { type: "admin", id: adminId, label: admin.email },
        { from: admin.full_name ?? NO_NAME, to: name }
      );
      return { success: true };
    });
    if (result.error) return result;
  } catch (error) {
    if (getErrorCode(error) === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidatePath("/admin/admins");
  revalidatePath("/admin/candidates");
  return { success: true };
}

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
  if (email.length > MAX_EMAIL_LENGTH) {
    return { error: EMAIL_TOO_LONG };
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
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (isPasswordTooLong(password)) {
    return { error: PASSWORD_TOO_LONG };
  }
  if (password !== confirmPassword) {
    return { error: "The two passwords don't match." };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    return await withTransaction<AdminActionState>(async (client) => {
      const admin = await lockAdmin(client, adminId);
      if (!admin) return { error: NOT_FOUND };

      // Also signs the admin out everywhere (their sign-ins carry the old version).
      await client.query(`update users set password_hash = $2, session_version = session_version + 1 where id = $1`, [
        adminId,
        passwordHash,
      ]);
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
      if (!admin) return { error: "This Admin has already been deleted." };

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

// Moves every candidate of one admin to another (e.g. before deleting the first), logged per candidate.
export async function moveAllCandidates(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const session = await requireRole(["superadmin"]);

  const fromId = String(formData.get("adminId") ?? "");
  const toId = String(formData.get("toAdminId") ?? "");
  if (!toId) return { error: "Choose an Admin." };
  if (!isUuid(fromId) || !isUuid(toId) || fromId === toId) return { error: NOT_FOUND };

  let result: AdminActionState;
  try {
    result = await withTransaction<AdminActionState>(async (client) => {
      const from = await lockAdmin(client, fromId);
      const { rows: targets } = await client.query<{ email: string }>(
        `select email from users where id = $1 and role = 'admin' for key share`,
        [toId]
      );
      if (!from || !targets[0]) return { error: "Admin not found. The page has been refreshed." };
      const { rows: moved } = await client.query<{ id: string; email: string }>(
        `update users set admin_id = $2
         where id in (select id from users where admin_id = $1 and role = 'candidate' order by id for update)
         returning id, email`,
        [fromId, toId]
      );
      for (const candidate of moved) {
        await logActivity(
          client,
          session,
          "candidate.admin_changed",
          { type: "candidate", id: candidate.id, label: candidate.email },
          { from: from.email, to: targets[0].email }
        );
      }
      return { success: true };
    });
  } catch (error) {
    // 23503: the target admin was deleted at the same moment.
    if (getErrorCode(error) === "23503") return { error: "Admin not found. The page has been refreshed." };
    throw error;
  }

  revalidatePath("/admin/admins");
  revalidatePath("/admin/candidates");
  return result;
}

async function lockAdmin(
  client: PoolClient,
  adminId: string
): Promise<{ email: string; full_name: string | null } | undefined> {
  const { rows } = await client.query<{ email: string; full_name: string | null }>(
    `select email, full_name from users where id = $1 and role = 'admin' for update`,
    [adminId]
  );
  return rows[0];
}

function blockedMessage(candidateCount: number) {
  return `This Admin still owns ${candidateCount} candidate${
    candidateCount === 1 ? "" : "s"
  }. Move them to another Admin before deleting.`;
}
