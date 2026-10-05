"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { archiveLoginRecords } from "@/lib/audit/archive";
import type { FormState } from "@/components/admin/action-form";
import { StorageConfigError } from "@/lib/storage/storage";

export async function archiveOldLoginRecords(_prev: FormState): Promise<FormState> {
  const session = await requireRole(["superadmin"]);
  let result;
  try {
    result = await archiveLoginRecords(session);
  } catch (error) {
    console.error("Login record archive failed", error);
    revalidatePath("/admin/activity");
    if (error instanceof StorageConfigError) return { error: "File storage isn’t set up, so nothing was archived." };
    return { error: "The archive couldn’t be completed. Any month already listed below was saved; nothing else was deleted. Please try again." };
  }
  revalidatePath("/admin/activity");
  if (result.archived.length === 0) return { error: "There’s nothing to archive yet." };
  return { success: true };
}
