"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { BACKUP_PATH, BACKUP_ROLES } from "@/lib/content/backup/access";
import { makeDatabaseBackup } from "@/lib/database-backup/make";
import { formatBytes } from "@/lib/format";

export type BackUpNowResult = { ok: true; id: string; size: string } | { ok: false; error: string };

// Back Up Now: a database backup made at once (logged); the browser then downloads it.
export async function backUpNow(): Promise<BackUpNowResult> {
  const session = await requireRole(BACKUP_ROLES);
  const result = await makeDatabaseBackup({ session });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(BACKUP_PATH);
  return { ok: true, id: result.id, size: formatBytes(result.bytes) };
}
