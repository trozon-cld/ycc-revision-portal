import { pool } from "@/lib/db/pool";

export type CandidateHome = {
  email: string;
  accessExpiresAt: string | null;
  current: { id: string; name: string; groupName: string };
  // How many categories the candidate can choose from (their group's size).
  choices: number;
  assigned: { id: string; name: string };
};

// Read live, not from the JWT, so an extension or a category change shows straight away.
export async function loadCandidateHome(userId: string): Promise<CandidateHome | null> {
  const { rows } = await pool.query<{
    email: string;
    access_expires_at: Date | null;
    current_id: string;
    current_name: string;
    group_name: string;
    assigned_id: string;
    assigned_name: string;
    choices: number;
  }>(
    `select u.email, u.access_expires_at,
            cur.id as current_id, cur.name as current_name, g.name as group_name,
            asg.id as assigned_id, asg.name as assigned_name,
            (select count(*)::int from categories c where c.group_id = asg.group_id) as choices
     from users u
     join categories cur on cur.id = u.current_category_id
     join category_groups g on g.id = cur.group_id
     join categories asg on asg.id = u.category_id
     where u.id = $1 and u.role = 'candidate'`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    email: row.email,
    accessExpiresAt: row.access_expires_at ? row.access_expires_at.toISOString() : null,
    current: { id: row.current_id, name: row.current_name, groupName: row.group_name },
    assigned: { id: row.assigned_id, name: row.assigned_name },
    choices: row.choices,
  };
}
