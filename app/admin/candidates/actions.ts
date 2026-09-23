"use server";

import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import type { SessionPayload } from "@/lib/auth/jwt";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { accessEndSql, formatUkDate, resolveAccessEndDate } from "@/lib/candidates/access";

export type CandidateActionState = { error?: string; success?: boolean };
export type CreateCandidateState = CandidateActionState;
export type ChangeAdminState = CandidateActionState;

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOT_FOUND = "Candidate not found. The page has been refreshed.";
const DUPLICATE_EMAIL = "An account with this email already exists.";
const INVALID_CATEGORY = "Selected category is invalid.";

interface OwnedCandidate {
  email: string;
  category_name: string;
  access_expires_at: string | null;
  is_blocked: boolean;
}

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
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string; access_expires_at: string }>(
        `insert into users
           (email, password_hash, role, category_id, admin_id, access_start_at, access_expires_at, is_blocked)
         values
           ($1, $2, 'candidate', $3, $4, now(), ${accessEndSql("$5")}, false)
         returning id, access_expires_at`,
        [email, passwordHash, categoryId, session.sub, access.date]
      );
      await logActivity(
        client,
        session,
        "candidate.created",
        { type: "candidate", id: rows[0].id, label: email },
        {
          category: await categoryName(client, categoryId),
          accessUntil: formatUkDate(rows[0].access_expires_at),
        }
      );
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_EMAIL };
    if (code === "23503" || code === "22P02") return { error: INVALID_CATEGORY };
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

  return changeOwnCandidate(session, formData, async (client, id, candidate) => {
    if (candidate.email === email) return;
    await client.query(`update users set email = $2 where id = $1`, [id, email]);
    await logActivity(
      client,
      session,
      "candidate.email_changed",
      { type: "candidate", id, label: email },
      { from: candidate.email, to: email }
    );
  });
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
  return changeOwnCandidate(session, formData, async (client, id, candidate) => {
    await client.query(`update users set password_hash = $2 where id = $1`, [id, passwordHash]);
    await logActivity(client, session, "candidate.password_changed", {
      type: "candidate",
      id,
      label: candidate.email,
    });
  });
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

  const result = await changeOwnCandidate(session, formData, async (client, id, candidate) => {
    const newName = await categoryName(client, categoryId);
    if (newName === candidate.category_name) return;
    await client.query(`update users set category_id = $2 where id = $1`, [id, categoryId]);
    await logActivity(
      client,
      session,
      "candidate.category_changed",
      { type: "candidate", id, label: candidate.email },
      { from: candidate.category_name, to: newName }
    );
  });
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

  return changeOwnCandidate(session, formData, async (client, id, candidate) => {
    const { rows } = await client.query<{ access_expires_at: string }>(
      `update users set access_expires_at = ${accessEndSql("$2")} where id = $1
       returning access_expires_at`,
      [id, access.date]
    );
    await logActivity(
      client,
      session,
      "candidate.access_changed",
      { type: "candidate", id, label: candidate.email },
      {
        from: candidate.access_expires_at ? formatUkDate(candidate.access_expires_at) : "No expiry",
        to: formatUkDate(rows[0].access_expires_at),
      }
    );
  });
}

export async function setCandidateBlocked(
  _prevState: CandidateActionState,
  formData: FormData
): Promise<CandidateActionState> {
  const session = await requireRole(["admin"]);
  const blocked = formData.get("blocked") === "true";

  return changeOwnCandidate(session, formData, async (client, id, candidate) => {
    if (candidate.is_blocked === blocked) return;
    await client.query(`update users set is_blocked = $2 where id = $1`, [id, blocked]);
    await logActivity(client, session, blocked ? "candidate.blocked" : "candidate.unblocked", {
      type: "candidate",
      id,
      label: candidate.email,
    });
  });
}

export async function deleteCandidate(
  _prevState: CandidateActionState,
  formData: FormData
): Promise<CandidateActionState> {
  const session = await requireRole(["admin"]);

  const result = await changeOwnCandidate(session, formData, async (client, id, candidate) => {
    await client.query(`delete from users where id = $1`, [id]);
    await logActivity(
      client,
      session,
      "candidate.deleted",
      { type: "candidate", id, label: candidate.email },
      { category: candidate.category_name }
    );
  });

  revalidatePath("/admin/categories");
  revalidatePath("/admin/admins");
  return result;
}

export async function changeCandidateAdmin(
  _prevState: CandidateActionState,
  formData: FormData
): Promise<CandidateActionState> {
  const session = await requireRole(["superadmin"]);

  const candidateId = String(formData.get("candidateId") ?? "");
  const adminId = String(formData.get("adminId") ?? "");

  if (!candidateId || !adminId) {
    return { error: "Choose an admin." };
  }

  let result: CandidateActionState;
  try {
    // Both roles are checked in SQL so a forged id can't move a candidate to a non-admin.
    result = await withTransaction<CandidateActionState>(async (client) => {
      const { rows: candidates } = await client.query<{ email: string; admin_email: string }>(
        `select u.email, a.email as admin_email
         from users u join users a on a.id = u.admin_id
         where u.id = $1 and u.role = 'candidate'
         for update of u`,
        [candidateId]
      );
      const { rows: admins } = await client.query<{ email: string }>(
        `select email from users where id = $1 and role = 'admin'`,
        [adminId]
      );
      const candidate = candidates[0];
      const newAdmin = admins[0];
      if (!candidate || !newAdmin) {
        return { error: "Candidate or admin not found. The page has been refreshed." };
      }
      if (candidate.admin_email === newAdmin.email) return { success: true };

      await client.query(`update users set admin_id = $2 where id = $1`, [candidateId, adminId]);
      await logActivity(
        client,
        session,
        "candidate.admin_changed",
        { type: "candidate", id: candidateId, label: candidate.email },
        { from: candidate.admin_email, to: newAdmin.email }
      );
      return { success: true };
    });
  } catch (error) {
    if (getErrorCode(error) === "22P02") {
      return { error: "Candidate or admin not found." };
    }
    throw error;
  }

  revalidatePath("/admin/candidates");
  revalidatePath("/admin/admins");
  return result;
}

// Locks the row only if this admin owns the candidate — a forged candidateId matches nothing.
// `change` returning without writing means "nothing to change", which still counts as success.
async function changeOwnCandidate(
  session: SessionPayload,
  formData: FormData,
  change: (client: PoolClient, candidateId: string, candidate: OwnedCandidate) => Promise<void>
): Promise<CandidateActionState> {
  const candidateId = String(formData.get("candidateId") ?? "");

  let result: CandidateActionState;
  try {
    result = await withTransaction<CandidateActionState>(async (client) => {
      const { rows } = await client.query<OwnedCandidate>(
        `select u.email, c.name as category_name, u.access_expires_at, u.is_blocked
         from users u join categories c on c.id = u.category_id
         where u.id = $1 and u.role = 'candidate' and u.admin_id = $2
         for update of u`,
        [candidateId, session.sub]
      );
      if (!rows[0]) return { error: NOT_FOUND };

      await change(client, candidateId, rows[0]);
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_EMAIL };
    if (code === "23503") return { error: INVALID_CATEGORY };
    if (code === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidatePath("/admin/candidates");
  return result;
}

// Throws a foreign-key-style error for an unknown id so callers map it to INVALID_CATEGORY.
async function categoryName(client: PoolClient, categoryId: string): Promise<string> {
  const { rows } = await client.query<{ name: string }>(
    `select name from categories where id = $1`,
    [categoryId]
  );
  if (!rows[0]) {
    throw Object.assign(new Error("Category not found"), { code: "23503" });
  }
  return rows[0].name;
}
