"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import type { StructureActionState } from "@/lib/handbook/structure";

export async function setStructureLock(_prevState: StructureActionState, formData: FormData): Promise<StructureActionState> {
  const session = await requireRole(CONTENT_EDITORS);
  const value = String(formData.get("locked") ?? "");
  if (value !== "true" && value !== "false") return { error: "Unknown choice." };
  const locked = value === "true";

  const result = await withTransaction<StructureActionState>(async (client) => {
    const { rows } = await client.query<{ locked: boolean }>(`select locked from structure_lock for update`);
    if (rows[0]?.locked === locked) return { success: true };
    await client.query(`update structure_lock set locked = $1, changed_by = $2, changed_at = now()`, [locked, session.sub]);
    await logActivity(
      client,
      session,
      locked ? "structure.locked" : "structure.unlocked",
      { type: "structure", id: null, label: "Handbook structure" }
    );
    return { success: true };
  });

  revalidatePath("/admin/handbook", "layout");
  revalidatePath("/admin/test-types");
  return result;
}
