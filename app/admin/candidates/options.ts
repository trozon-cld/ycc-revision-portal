import { pool } from "@/lib/db/pool";
import type { TestTypeChoice } from "./test-type-options";

export type AdminOption = { id: string; label: string };

// Every test type, grouped for the test type selects (sorted by test area, then name).
export async function loadTestTypeChoices(): Promise<TestTypeChoice[]> {
  const { rows } = await pool.query<TestTypeChoice>(
    `select c.id, c.name, g.name as "testArea"
     from test_types c join test_areas g on g.id = c.test_area_id
     order by g.position, c.position`
  );
  return rows;
}

// Admins as "Name (email)", or the email when there is no name.
export async function loadAdminOptions(): Promise<AdminOption[]> {
  const { rows } = await pool.query<AdminOption>(
    `select id, coalesce(full_name || ' (' || email || ')', email) as label
     from users where role = 'admin' order by lower(coalesce(full_name, email))`
  );
  return rows;
}
