"use server";

import bcrypt from "bcryptjs";
import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import type { SessionPayload } from "@/lib/auth/jwt";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { NO_NAME, normaliseName, validateName } from "@/lib/users/name";
import { accessBaseDate, accessEndSql, formatUkDate, resolveAccessEndDate } from "@/lib/candidates/access";
import { isUuid } from "@/lib/ids";
import { settleMocks } from "@/lib/mock/attempts";
import { BCRYPT_COST, DUPLICATE_EMAIL, EMAIL_PATTERN, EMAIL_TOO_LONG, isPasswordTooLong, MAX_EMAIL_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_TOO_LONG } from "@/lib/users/credentials";
import type { FormState } from "@/lib/forms";

export type CandidateActionState = FormState;

const NOT_FOUND = "Candidate not found. The page has been refreshed.";
const INVALID_TEST_TYPE = "Selected category is invalid.";

interface OwnedCandidate {
  email: string;
  full_name: string | null;
  test_type_id: string;
  test_type_name: string;
  current_test_type_name: string;
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
  const testTypeId = String(formData.get("testTypeId") ?? "");
  const name = normaliseName(formData.get("name"));

  const invalidName = validateName(name);
  if (invalidName) return { error: invalidName };
  if (!email || !password || !testTypeId) {
    return { error: "Email, password and category are required." };
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
  const access = resolveAccessEndDate(formData);
  if ("error" in access) {
    return { error: access.error };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string; access_expires_at: string }>(
        `insert into users
           (email, password_hash, role, test_type_id, current_test_type_id, admin_id,
            access_start_at, access_expires_at, is_blocked, full_name)
         values
           ($1, $2, 'candidate', $3, $3, $4, now(), ${accessEndSql("$5")}, false, $6)
         returning id, access_expires_at`,
        [email, passwordHash, testTypeId, session.sub, access.date, name]
      );
      await logActivity(
        client,
        session,
        "candidate.created",
        { type: "candidate", id: rows[0].id, label: email },
        {
          name,
          testType: await testTypeName(client, testTypeId),
          accessUntil: formatUkDate(rows[0].access_expires_at),
        }
      );
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_EMAIL };
    if (code === "23503" || code === "22P02") return { error: INVALID_TEST_TYPE };
    throw error;
  }

  revalidatePath("/admin/candidates");
  return { success: true };
}

export async function updateCandidateName(
  _prevState: CandidateActionState,
  formData: FormData
): Promise<CandidateActionState> {
  const session = await requireRole(["admin"]);
  const name = normaliseName(formData.get("name"));
  const invalid = validateName(name);
  if (invalid) return { error: invalid };

  return changeOwnCandidate(session, formData, async (client, id, candidate) => {
    if (candidate.full_name === name) return;
    await client.query(`update users set full_name = $2 where id = $1`, [id, name]);
    await logActivity(
      client,
      session,
      "candidate.name_changed",
      { type: "candidate", id, label: candidate.email },
      { from: candidate.full_name ?? NO_NAME, to: name }
    );
  });
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
  if (email.length > MAX_EMAIL_LENGTH) {
    return { error: EMAIL_TOO_LONG };
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
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (isPasswordTooLong(password)) {
    return { error: PASSWORD_TOO_LONG };
  }
  if (password !== confirmPassword) {
    return { error: "The two passwords don't match." };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  return changeOwnCandidate(session, formData, async (client, id, candidate) => {
    // Also signs the candidate out everywhere (their sign-ins carry the old version).
    await client.query(`update users set password_hash = $2, session_version = session_version + 1 where id = $1`, [
      id,
      passwordHash,
    ]);
    await logActivity(client, session, "candidate.password_changed", {
      type: "candidate",
      id,
      label: candidate.email,
    });
  });
}

export async function updateCandidateTestType(
  _prevState: CandidateActionState,
  formData: FormData
): Promise<CandidateActionState> {
  const session = await requireRole(["admin"]);
  const testTypeId = String(formData.get("testTypeId") ?? "");

  if (!testTypeId) {
    return { error: "Choose a category." };
  }
  if (!isUuid(testTypeId)) return { error: INVALID_TEST_TYPE };

  // A new assigned test type also becomes the current one, so the candidate starts there.
  const result = await changeOwnCandidate(session, formData, async (client, id, candidate) => {
    const newName = await testTypeName(client, testTypeId);
    if (testTypeId === candidate.test_type_id) return;
    await client.query(`update users set test_type_id = $2, current_test_type_id = $2 where id = $1`, [
      id,
      testTypeId,
    ]);
    // A test open in the old test type ends now with what was saved, as agreed for mock tests.
    await settleMocks(client, [id]);
    const details: Record<string, string> = { from: candidate.test_type_name, to: newName };
    if (candidate.current_test_type_name !== candidate.test_type_name) {
      details.previousCurrent = candidate.current_test_type_name;
    }
    await logActivity(
      client,
      session,
      "candidate.test_type_changed",
      { type: "candidate", id, label: candidate.email },
      details
    );
  });
  if (result.success) {
    revalidatePath("/admin/test-types");
  }
  return result;
}

export async function updateCandidateAccess(
  _prevState: CandidateActionState,
  formData: FormData
): Promise<CandidateActionState> {
  const session = await requireRole(["admin"]);

  return changeOwnCandidate(session, formData, async (client, id, candidate) => {
    // Presets add to the current end date (or today, if it has passed), read under the row lock.
    const access = resolveAccessEndDate(formData, accessBaseDate(candidate.access_expires_at));
    if ("error" in access) return access.error;
    // The same end date again changes nothing, so nothing is written or logged.
    const { rows } = await client.query<{ access_expires_at: string }>(
      `update users set access_expires_at = ${accessEndSql("$2")}
       where id = $1 and access_expires_at is distinct from ${accessEndSql("$2")}
       returning access_expires_at`,
      [id, access.date]
    );
    if (!rows[0]) return;
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
      { testType: candidate.test_type_name }
    );
  });

  revalidatePath("/admin/test-types");
  revalidatePath("/admin/admins");
  // Deleted from their Progress page: that page is gone, so go back to the list.
  if (result.success && formData.get("back") === "list") redirect("/admin/candidates?done=deleted");
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
    return { error: "Choose an Admin." };
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
        `select email from users where id = $1 and role = 'admin' for key share`,
        [adminId]
      );
      const candidate = candidates[0];
      const newAdmin = admins[0];
      if (!candidate || !newAdmin) {
        return { error: "Candidate or Admin not found. The page has been refreshed." };
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
    // 23503: the admin was deleted at the same moment.
    const code = getErrorCode(error);
    if (code === "22P02" || code === "23503") {
      return { error: "Candidate or Admin not found." };
    }
    throw error;
  }

  revalidatePath("/admin/candidates");
  revalidatePath("/admin/admins");
  return result;
}

// Locks the row only if this admin owns the candidate — a forged candidateId matches nothing.
// `change` returning without writing means "nothing to change" (success); returning a message refuses.
async function changeOwnCandidate(
  session: SessionPayload,
  formData: FormData,
  change: (client: PoolClient, candidateId: string, candidate: OwnedCandidate) => Promise<void | string>
): Promise<CandidateActionState> {
  const candidateId = String(formData.get("candidateId") ?? "");

  let result: CandidateActionState;
  try {
    result = await withTransaction<CandidateActionState>(async (client) => {
      const { rows } = await client.query<OwnedCandidate>(
        `select u.email, u.full_name, u.test_type_id, c.name as test_type_name, cc.name as current_test_type_name,
                u.access_expires_at, u.is_blocked
         from users u
         join test_types c on c.id = u.test_type_id
         join test_types cc on cc.id = u.current_test_type_id
         where u.id = $1 and u.role = 'candidate' and u.admin_id = $2
         for update of u`,
        [candidateId, session.sub]
      );
      if (!rows[0]) return { error: NOT_FOUND };

      const refused = await change(client, candidateId, rows[0]);
      return refused ? { error: refused } : { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_EMAIL };
    if (code === "23503") return { error: INVALID_TEST_TYPE };
    if (code === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidatePath("/admin/candidates");
  return result;
}

// Throws a foreign-key-style error for an unknown id so callers map it to INVALID_TEST_TYPE.
async function testTypeName(client: PoolClient, testTypeId: string): Promise<string> {
  const { rows } = await client.query<{ name: string }>(
    `select name from test_types where id = $1`,
    [testTypeId]
  );
  if (!rows[0]) {
    throw Object.assign(new Error("Category not found"), { code: "23503" });
  }
  return rows[0].name;
}
