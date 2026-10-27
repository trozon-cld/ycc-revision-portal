import { pool } from "@/lib/db/pool";
import { isUuid } from "@/lib/ids";
import type { SessionPayload } from "@/lib/auth/jwt";
import { loadSwitchableTestTypes, type SwitchableTestType } from "./test-types";

// One candidate as staff see them on the Progress page. Admins only reach their own candidates.

export type CandidateDetail = {
  id: string;
  email: string;
  name: string | null;
  admin: { id: string; name: string | null; email: string };
  assigned: { id: string; name: string };
  current: { id: string; name: string };
  // The test types they can switch between (their test area).
  testAreaTestTypes: SwitchableTestType[];
  isBlocked: boolean;
  accessExpiresAt: Date | null;
  lastLoginAt: Date | null;
  // Listen's language code, chosen by the candidate on their Account page.
  language: string;
};

// The latest successful login of `u` (newest first on the user/time index; login records cover the last 180 days or so).
export const LAST_LOGIN_SQL = `(select e.created_at from auth_events e where e.user_id = u.id and e.event = 'login_success' order by e.created_at desc limit 1)`;

export async function loadCandidateDetail(candidateId: string, viewer: SessionPayload): Promise<CandidateDetail | null> {
  if (!isUuid(candidateId)) return null;
  const { rows } = await pool.query<{
    id: string;
    email: string;
    full_name: string | null;
    admin_id: string;
    admin_name: string | null;
    admin_email: string;
    assigned_id: string;
    assigned_name: string;
    current_id: string;
    current_name: string;
    is_blocked: boolean;
    access_expires_at: Date | null;
    last_login_at: Date | null;
    preferred_language: string;
  }>(
    `select u.id, u.email, u.full_name, a.id as admin_id, a.full_name as admin_name, a.email as admin_email,
            asg.id as assigned_id, asg.name as assigned_name, cur.id as current_id, cur.name as current_name,
            u.is_blocked, u.access_expires_at, u.preferred_language,
            ${LAST_LOGIN_SQL} as last_login_at
     from users u
     join users a on a.id = u.admin_id
     join test_types asg on asg.id = u.test_type_id
     join test_types cur on cur.id = u.current_test_type_id
     where u.id = $1 and u.role = 'candidate' and ($2::uuid is null or u.admin_id = $2::uuid)`,
    [candidateId, viewer.role === "superadmin" ? null : viewer.sub]
  );
  const row = rows[0];
  if (!row) return null;
  const testArea = await loadSwitchableTestTypes(row.id);
  return {
    id: row.id,
    email: row.email,
    name: row.full_name,
    admin: { id: row.admin_id, name: row.admin_name, email: row.admin_email },
    assigned: { id: row.assigned_id, name: row.assigned_name },
    current: { id: row.current_id, name: row.current_name },
    testAreaTestTypes: testArea,
    isBlocked: row.is_blocked,
    accessExpiresAt: row.access_expires_at,
    lastLoginAt: row.last_login_at,
    language: row.preferred_language,
  };
}
