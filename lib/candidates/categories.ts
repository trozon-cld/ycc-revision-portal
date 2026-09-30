import { pool } from "@/lib/db/pool";

export type SwitchableCategory = { id: string; name: string; isCurrent: boolean; isAssigned: boolean };

// Every category in the assigned category's group: the only ones a candidate may switch to.
export async function loadSwitchableCategories(userId: string): Promise<SwitchableCategory[]> {
  const { rows } = await pool.query<{ id: string; name: string; is_current: boolean; is_assigned: boolean }>(
    `select c.id, c.name, c.id = u.current_category_id as is_current, c.id = u.category_id as is_assigned
     from users u
     join categories asg on asg.id = u.category_id
     join categories c on c.group_id = asg.group_id
     where u.id = $1 and u.role = 'candidate'
     order by c.name`,
    [userId]
  );
  return rows.map((row) => ({ id: row.id, name: row.name, isCurrent: row.is_current, isAssigned: row.is_assigned }));
}
