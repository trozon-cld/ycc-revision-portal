"use server";

import { revalidatePath } from "next/cache";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { requireRole } from "@/lib/auth/guard";
import {
  finishBulkRun,
  runBulkStep,
  startBulkRun,
  type BulkItemKind,
  type BulkOutcome,
  type BulkStart,
  type BulkStep,
  type BulkStepResult,
} from "@/lib/voice/bulk";
import { removeChapterLanguage } from "@/lib/voice/chapter-removal";
import type { FormState } from "@/lib/forms";

export type RemoveChapterLanguageState = FormState;

// Bulk Listen: the browser starts a run, sends one step at a time, then finishes it (the run's one log entry).

export async function startBulkRunAction(chapterId: string, language: string): Promise<BulkStart> {
  const session = await requireRole(CONTENT_EDITORS);
  return startBulkRun(session, String(chapterId ?? ""), String(language ?? "").slice(0, 10));
}

export async function bulkStepAction(input: { runId: string; kind: BulkItemKind; id: string; step: BulkStep }): Promise<BulkStepResult> {
  const session = await requireRole(CONTENT_EDITORS);
  return runBulkStep(session, {
    runId: String(input?.runId ?? ""),
    kind: input?.kind,
    id: String(input?.id ?? ""),
    step: input?.step,
  });
}

export async function finishBulkRunAction(input: { runId: string; outcome: BulkOutcome; failed: number }): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireRole(CONTENT_EDITORS);
  const result = await finishBulkRun(session, String(input?.runId ?? ""), input?.outcome, Number(input?.failed ?? 0));
  revalidatePath("/admin/handbook/languages", "layout");
  return result;
}

// Remove: one language's translations and audio in one chapter (form fields "chapterId" and "language").
export async function removeChapterLanguageAction(_prev: RemoveChapterLanguageState | undefined, formData: FormData): Promise<RemoveChapterLanguageState> {
  const session = await requireRole(CONTENT_EDITORS);
  const result = await removeChapterLanguage(session, String(formData.get("chapterId") ?? ""), String(formData.get("language") ?? "").slice(0, 10));
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/handbook/languages", "layout");
  return { success: true };
}
