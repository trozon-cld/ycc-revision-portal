import { pool } from "@/lib/db/pool";
import { isUuid } from "@/lib/ids";
import type { SessionPayload } from "@/lib/auth/jwt";
import { loadSwitchableCategories, type SwitchableCategory } from "./categories";

// One candidate as staff see them on the Progress page. Admins only reach their own candidates.

export type CandidateDetail = {
  id: string;
  email: string;
  name: string | null;
  admin: { name: string | null; email: string };
  assigned: { id: string; name: string };
  current: { id: string; name: string };
  // The categories they can switch between (their group).
  groupCategories: SwitchableCategory[];
  isBlocked: boolean;
  accessExpiresAt: Date | null;
  lastLoginAt: Date | null;
};

export async function loadCandidateDetail(candidateId: string, viewer: SessionPayload): Promise<CandidateDetail | null> {
  if (!isUuid(candidateId)) return null;
  const { rows } = await pool.query<{
    id: string;
    email: string;
    full_name: string | null;
    admin_name: string | null;
    admin_email: string;
    assigned_id: string;
    assigned_name: string;
    current_id: string;
    current_name: string;
    is_blocked: boolean;
    access_expires_at: Date | null;
    last_login_at: Date | null;
  }>(
    `select u.id, u.email, u.full_name, a.full_name as admin_name, a.email as admin_email,
            asg.id as assigned_id, asg.name as assigned_name, cur.id as current_id, cur.name as current_name,
            u.is_blocked, u.access_expires_at,
            (select max(e.created_at) from auth_events e where e.user_id = u.id and e.event = 'login_success') as last_login_at
     from users u
     join users a on a.id = u.admin_id
     join categories asg on asg.id = u.category_id
     join categories cur on cur.id = u.current_category_id
     where u.id = $1 and u.role = 'candidate' and ($2::uuid is null or u.admin_id = $2::uuid)`,
    [candidateId, viewer.role === "superadmin" ? null : viewer.sub]
  );
  const row = rows[0];
  if (!row) return null;
  const group = await loadSwitchableCategories(row.id);
  return {
    id: row.id,
    email: row.email,
    name: row.full_name,
    admin: { name: row.admin_name, email: row.admin_email },
    assigned: { id: row.assigned_id, name: row.assigned_name },
    current: { id: row.current_id, name: row.current_name },
    groupCategories: group,
    isBlocked: row.is_blocked,
    accessExpiresAt: row.access_expires_at,
    lastLoginAt: row.last_login_at,
  };
}
