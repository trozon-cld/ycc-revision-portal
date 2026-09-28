"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { logActivity } from "@/lib/audit/log";
import { isUuid } from "@/lib/content/pages";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";

type Outcome = "switched" | "unchanged" | "unavailable";

export async function switchCategory(formData: FormData) {
  const session = await requireRole(["candidate"]);
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!isUuid(categoryId)) redirect("/dashboard/category?error=choose");

  let outcome: Outcome;
  try {
    outcome = await withTransaction<Outcome>(async (client) => {
      const { rows: users } = await client.query<{
        email: string;
        current_category_id: string;
        current_name: string;
        group_id: string;
      }>(
        `select u.email, u.current_category_id, cur.name as current_name, asg.group_id
         from users u
         join categories cur on cur.id = u.current_category_id
         join categories asg on asg.id = u.category_id
         where u.id = $1 and u.role = 'candidate'
         for update of u`,
        [session.sub]
      );
      const user = users[0];
      if (!user) return "unavailable";
      if (user.current_category_id === categoryId) return "unchanged";

      const { rows: targets } = await client.query<{ name: string; group_id: string }>(
        `select name, group_id from categories where id = $1 for share`,
        [categoryId]
      );
      const target = targets[0];
      if (!target || target.group_id !== user.group_id) return "unavailable";

      await client.query(`update users set current_category_id = $2 where id = $1`, [session.sub, categoryId]);
      await logActivity(
        client,
        session,
        "candidate.category_switched",
        { type: "candidate", id: session.sub, label: user.email },
        { from: user.current_name, to: target.name }
      );
      return "switched";
    });
  } catch (error) {
    // 23514: the database's group check refused it (a backstop; the checks above normally catch it).
    if (getErrorCode(error) !== "23514") throw error;
    outcome = "unavailable";
  }

  if (outcome === "unavailable") redirect("/dashboard/category?error=unavailable");
  redirect(outcome === "switched" ? "/dashboard?switched=1" : "/dashboard");
}
