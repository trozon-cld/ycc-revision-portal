import { pool } from "@/lib/db/pool";
import type { CategoryChoice } from "./category-options";

export type AdminOption = { id: string; label: string };

// Every category, grouped for the category selects (sorted by group, then name).
export async function loadCategoryChoices(): Promise<CategoryChoice[]> {
  const { rows } = await pool.query<CategoryChoice>(
    `select c.id, c.name, g.name as "group"
     from categories c join category_groups g on g.id = c.group_id
     order by g.position, c.name`
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
