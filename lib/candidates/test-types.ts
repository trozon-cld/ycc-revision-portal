import { pool } from "@/lib/db/pool";

export type SwitchableTestType = { id: string; name: string; isCurrent: boolean; isAssigned: boolean };

// Every test type in the assigned test type's test area: the only ones a candidate may switch to.
export async function loadSwitchableTestTypes(userId: string): Promise<SwitchableTestType[]> {
  const { rows } = await pool.query<{ id: string; name: string; is_current: boolean; is_assigned: boolean }>(
    `select c.id, c.name, c.id = u.current_test_type_id as is_current, c.id = u.test_type_id as is_assigned
     from users u
     join test_types asg on asg.id = u.test_type_id
     join test_types c on c.test_area_id = asg.test_area_id
     where u.id = $1 and u.role = 'candidate'
     order by c.name`,
    [userId]
  );
  return rows.map((row) => ({ id: row.id, name: row.name, isCurrent: row.is_current, isAssigned: row.is_assigned }));
}
