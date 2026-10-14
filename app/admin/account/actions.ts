"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { pool } from "@/lib/db/pool";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { ipFromHeaders, logActivity, logAuthEvent } from "@/lib/audit/log";
import { PASSWORD_PAUSED_WHAT, passwordCheckPause, pausedMessage } from "@/lib/auth/rate-limit";
import { requireRole } from "@/lib/auth/guard";
import { setSessionCookie } from "@/lib/auth/cookies";
import { NO_NAME, normaliseName, validateName } from "@/lib/users/name";
import { BCRYPT_COST, DUPLICATE_EMAIL, EMAIL_PATTERN, EMAIL_TOO_LONG, isPasswordTooLong, MAX_EMAIL_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_TOO_LONG } from "@/lib/users/credentials";
import type { FormState } from "@/lib/forms";
import type { SessionPayload } from "@/lib/auth/jwt";

export type AccountActionState = FormState;

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
  if (email.length > MAX_EMAIL_LENGTH) {
    return { error: EMAIL_TOO_LONG };
  }
  const passwordProblem = await checkCurrentPassword(session, currentPassword);
  if (passwordProblem) return { error: passwordProblem };

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
      return { error: DUPLICATE_EMAIL };
    }
    throw error;
  }

  // Re-issue the session so "Signed in as" shows the new email straight away.
  await setSessionCookie({ sub: session.sub, email, role: session.role, ver: session.ver, loginAt: session.loginAt });

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
    return { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (isPasswordTooLong(password)) {
    return { error: PASSWORD_TOO_LONG };
  }
  if (password !== confirmPassword) {
    return { error: "The two new passwords don't match." };
  }
  const passwordProblem = await checkCurrentPassword(session, currentPassword);
  if (passwordProblem) return { error: passwordProblem };

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  // A new password signs out every other device; this one gets a fresh sign-in so it stays in.
  const version = await withTransaction(async (client) => {
    const { rows } = await client.query<{ session_version: number }>(
      `update users set password_hash = $2, session_version = session_version + 1
       where id = $1 and role = 'superadmin' returning session_version`,
      [session.sub, passwordHash]
    );
    await logActivity(client, session, "account.password_changed", {
      type: "account",
      id: session.sub,
      label: session.email,
    });
    return rows[0]?.session_version;
  });
  if (version) {
    await setSessionCookie({ sub: session.sub, email: session.email, role: session.role, ver: version, loginAt: session.loginAt });
  }

  return { success: true };
}

// The error to show, or null when the current password is right. Wrong ones are noted; 5 in 15 minutes pause the check.
async function checkCurrentPassword(session: SessionPayload, password: string): Promise<string | null> {
  const paused = await passwordCheckPause(pool, session.sub);
  if (paused > 0) return pausedMessage(paused, PASSWORD_PAUSED_WHAT);
  const { rows } = await pool.query<{ password_hash: string }>(
    `select password_hash from users where id = $1 and role = 'superadmin'`,
    [session.sub]
  );
  if (password && rows[0] && (await bcrypt.compare(password, rows[0].password_hash))) return null;
  await logAuthEvent(pool, "password_check_failed", { id: session.sub, email: session.email, role: session.role }, ipFromHeaders(await headers()));
  const nowPaused = await passwordCheckPause(pool, session.sub);
  return nowPaused > 0 ? pausedMessage(nowPaused, PASSWORD_PAUSED_WHAT) : WRONG_PASSWORD;
}
