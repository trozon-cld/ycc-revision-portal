"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db/pool";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { requireRole } from "@/lib/auth/guard";
import { signToken } from "@/lib/auth/jwt";
import { setAuthCookie } from "@/lib/auth/cookies";
import { NO_NAME, normaliseName, validateName } from "@/lib/users/name";

export type AccountActionState = { error?: string; success?: boolean };

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WRONG_PASSWORD = "Your current password is incorrect.";

// Superadmin and Admins; no password needed for a display name.
export async function updateOwnName(
  _prevState: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const session = await requireRole(["superadmin", "admin"]);
  const name = normaliseName(formData.get("name"));
  const invalid = validateName(name);
  if (invalid) return { error: invalid };

  await withTransaction(async (client) => {
    const { rows } = await client.query<{ full_name: string | null; email: string }>(
      `select full_name, email from users where id = $1 and role in ('superadmin', 'admin') for update`,
      [session.sub]
    );
    const me = rows[0];
    if (!me || me.full_name === name) return;
    await client.query(`update users set full_name = $2 where id = $1`, [session.sub, name]);
    await logActivity(
      client,
      session,
      "account.name_changed",
      { type: "account", id: session.sub, label: me.email },
      { from: me.full_name ?? NO_NAME, to: name }
    );
  });

  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function updateOwnEmail(
  _prevState: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const session = await requireRole(["superadmin"]);
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const currentPassword = String(formData.get("currentPassword") ?? "");

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (!(await currentPasswordMatches(session.sub, currentPassword))) {
    return { error: WRONG_PASSWORD };
  }

  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ email: string }>(
        `select email from users where id = $1 and role = 'superadmin' for update`,
        [session.sub]
      );
      const previous = rows[0]?.email;
      if (!previous || previous === email) return;

      await client.query(`update users set email = $2 where id = $1`, [session.sub, email]);
      await logActivity(
        client,
        session,
        "account.email_changed",
        { type: "account", id: session.sub, label: email },
        { from: previous, to: email }
      );
    });
  } catch (error) {
    if (getErrorCode(error) === "23505") {
      return { error: "An account with this email already exists." };
    }
    throw error;
  }

  // Re-issue the session so "Signed in as" shows the new email straight away.
  await setAuthCookie(
    await signToken({
      sub: session.sub,
      email,
      role: session.role,
      isBlocked: session.isBlocked,
      accessExpiresAt: session.accessExpiresAt,
    })
  );

  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function updateOwnPassword(
  _prevState: AccountActionState,
  formData: FormData
): Promise<AccountActionState> {
  const session = await requireRole(["superadmin"]);
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: "New password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "The two new passwords don't match." };
  }
  if (!(await currentPasswordMatches(session.sub, currentPassword))) {
    return { error: WRONG_PASSWORD };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await withTransaction(async (client) => {
    await client.query(
      `update users set password_hash = $2 where id = $1 and role = 'superadmin'`,
      [session.sub, passwordHash]
    );
    await logActivity(client, session, "account.password_changed", {
      type: "account",
      id: session.sub,
      label: session.email,
    });
  });

  return { success: true };
}

async function currentPasswordMatches(userId: string, password: string): Promise<boolean> {
  if (!password) return false;
  const { rows } = await pool.query<{ password_hash: string }>(
    `select password_hash from users where id = $1 and role = 'superadmin'`,
    [userId]
  );
  return rows[0] ? bcrypt.compare(password, rows[0].password_hash) : false;
}
