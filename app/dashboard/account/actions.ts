"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { saveListeningLanguage } from "@/lib/voice/listen";

export type LanguageFormState = { error?: string; saved?: string };

// The candidate's listening language; logged only when it changes.
export async function saveLanguage(_previous: LanguageFormState, formData: FormData): Promise<LanguageFormState> {
  const session = await requireRole(["candidate"]);
  const result = await saveListeningLanguage(session, String(formData.get("language") ?? ""));
  if (!result.ok) return { error: result.error };
  if (result.changed) revalidatePath("/dashboard", "layout");
  return { saved: String(formData.get("language")) };
}
