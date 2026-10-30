"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { logActivity } from "@/lib/audit/log";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { isUuid } from "@/lib/ids";
import { SAVE_GRACE_SECONDS } from "@/lib/mock/types";

type Outcome = "switched" | "unchanged" | "unavailable" | "mock";

export async function switchTestType(formData: FormData) {
  const session = await requireRole(["candidate"]);
  const testTypeId = String(formData.get("testTypeId") ?? "");
  if (!isUuid(testTypeId)) redirect("/dashboard/test-type?error=choose");

  let outcome: Outcome;
  try {
    outcome = await withTransaction<Outcome>(async (client) => {
      const { rows: users } = await client.query<{
        email: string;
        current_test_type_id: string;
        current_name: string;
        test_area_id: string;
      }>(
        `select u.email, u.current_test_type_id, cur.name as current_name, asg.test_area_id
         from users u
         join test_types cur on cur.id = u.current_test_type_id
         join test_types asg on asg.id = u.test_type_id
         where u.id = $1 and u.role = 'candidate'
         for update of u`,
        [session.sub]
      );
      const user = users[0];
      if (!user) return "unavailable";
      if (user.current_test_type_id === testTypeId) return "unchanged";
      // A mock test in progress belongs to this test type: it's finished first.
      const { rowCount } = await client.query(
        `select 1 from mock_attempts where user_id = $1 and ended_at is null and deadline_at > now() - make_interval(secs => $2)`,
        [session.sub, SAVE_GRACE_SECONDS]
      );
      if (rowCount) return "mock";

      const { rows: targets } = await client.query<{ name: string; test_area_id: string }>(
        `select name, test_area_id from test_types where id = $1 for share`,
        [testTypeId]
      );
      const target = targets[0];
      if (!target || target.test_area_id !== user.test_area_id) return "unavailable";

      await client.query(`update users set current_test_type_id = $2 where id = $1`, [session.sub, testTypeId]);
      await logActivity(
        client,
        session,
        "candidate.test_type_switched",
        { type: "candidate", id: session.sub, label: user.email },
        { from: user.current_name, to: target.name }
      );
      return "switched";
    });
  } catch (error) {
    // 23514: the database's test area check refused it (a backstop; the checks above normally catch it).
    if (getErrorCode(error) !== "23514") throw error;
    outcome = "unavailable";
  }

  if (outcome === "unavailable" || outcome === "mock") redirect(`/dashboard/test-type?error=${outcome}`);
  redirect(outcome === "switched" ? "/dashboard?switched=1" : "/dashboard");
}
