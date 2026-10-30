import { pool } from "@/lib/db/pool";

export type CandidateHome = {
  email: string;
  name: string | null;
  accessExpiresAt: string | null;
  current: { id: string; name: string; testAreaName: string; listenEnabled: boolean };
  // How many test types the candidate can choose from (their test area's size).
  choices: number;
  assigned: { id: string; name: string };
  // Listen's language code (voice_languages).
  language: string;
};

// Read live, not from the JWT, so an extension or a test type change shows straight away.
export async function loadCandidateHome(userId: string): Promise<CandidateHome | null> {
  const { rows } = await pool.query<{
    email: string;
    full_name: string | null;
    access_expires_at: Date | null;
    current_id: string;
    current_name: string;
    test_area_name: string;
    listen_mode: string;
    assigned_id: string;
    assigned_name: string;
    choices: number;
    preferred_language: string;
  }>(
    `select u.email, u.full_name, u.access_expires_at,
            cur.id as current_id, cur.name as current_name, g.name as test_area_name, cur.listen_mode,
            asg.id as assigned_id, asg.name as assigned_name,
            (select count(*)::int from test_types c where c.test_area_id = asg.test_area_id) as choices,
            u.preferred_language
     from users u
     join test_types cur on cur.id = u.current_test_type_id
     join test_areas g on g.id = cur.test_area_id
     join test_types asg on asg.id = u.test_type_id
     where u.id = $1 and u.role = 'candidate'`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    email: row.email,
    name: row.full_name,
    accessExpiresAt: row.access_expires_at ? row.access_expires_at.toISOString() : null,
    current: { id: row.current_id, name: row.current_name, testAreaName: row.test_area_name, listenEnabled: row.listen_mode !== "off" },
    assigned: { id: row.assigned_id, name: row.assigned_name },
    choices: row.choices,
    language: row.preferred_language,
  };
}
