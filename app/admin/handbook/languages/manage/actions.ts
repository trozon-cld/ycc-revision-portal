"use server";

import { revalidatePath } from "next/cache";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { requireRole } from "@/lib/auth/guard";
import type { FormState } from "@/lib/forms";
import {
  addLanguage,
  checkPhrases,
  deleteLanguage,
  draftPhrases,
  hideLanguage,
  publishLanguage,
  restoreLanguage,
  savePhrases,
  setGeminiLimits,
  type ExpectedPhrases,
  type LanguageResult,
} from "@/lib/voice/language-admin";

export type LanguageActionState = FormState;

// After a change, the Languages tab, the language's phrases page and the Pages tab (its columns follow the languages).
// Not after a refusal: the phrases page would reload and lose the message and any unsaved typing.
function refresh(code: string, result: LanguageResult) {
  if (!result.ok) return;
  revalidatePath("/admin/handbook/languages/manage");
  revalidatePath(`/admin/handbook/languages/manage/${code}`);
  revalidatePath("/admin/handbook/languages");
}

function asFormState(result: LanguageResult): LanguageActionState {
  return result.ok ? { success: true } : { error: result.error };
}

function codeFrom(formData: FormData): string {
  return String(formData.get("code") ?? "").slice(0, 10);
}

export async function addLanguageAction(_prev: LanguageActionState | undefined, formData: FormData): Promise<LanguageActionState> {
  const session = await requireRole(CONTENT_EDITORS);
  const code = codeFrom(formData);
  const result = await addLanguage(session, code);
  refresh(code, result);
  return asFormState(result);
}

export async function publishLanguageAction(_prev: LanguageActionState | undefined, formData: FormData): Promise<LanguageActionState> {
  const session = await requireRole(CONTENT_EDITORS);
  const code = codeFrom(formData);
  const result = await publishLanguage(session, code);
  refresh(code, result);
  return asFormState(result);
}

export async function hideLanguageAction(_prev: LanguageActionState | undefined, formData: FormData): Promise<LanguageActionState> {
  const session = await requireRole(CONTENT_EDITORS);
  const code = codeFrom(formData);
  const result = await hideLanguage(session, code);
  refresh(code, result);
  return asFormState(result);
}

// Superadmin only (not CONTENT_EDITORS): deleting a language can't be undone.
export async function deleteLanguageAction(_prev: LanguageActionState | undefined, formData: FormData): Promise<LanguageActionState> {
  const session = await requireRole(["superadmin"]);
  const code = codeFrom(formData);
  const result = await deleteLanguage(session, code);
  refresh(code, result);
  return asFormState(result);
}

export async function restoreLanguageAction(code: string): Promise<LanguageActionState> {
  const session = await requireRole(CONTENT_EDITORS);
  const result = await restoreLanguage(session, String(code).slice(0, 10));
  refresh(String(code), result);
  return asFormState(result);
}

export async function draftLanguagePhrases(code: string, expected: ExpectedPhrases): Promise<LanguageResult> {
  const session = await requireRole(CONTENT_EDITORS);
  const result = await draftPhrases(session, String(code).slice(0, 10), expected ?? {});
  refresh(String(code), result);
  return result;
}

export async function saveLanguagePhrases(input: { code: string; expected: ExpectedPhrases; texts: unknown }): Promise<LanguageResult> {
  const session = await requireRole(CONTENT_EDITORS);
  const code = String(input?.code ?? "").slice(0, 10);
  const result = await savePhrases(session, code, input?.expected ?? {}, input?.texts);
  refresh(code, result);
  return result;
}

export async function checkLanguagePhrases(code: string, expected: ExpectedPhrases): Promise<LanguageResult> {
  const session = await requireRole(CONTENT_EDITORS);
  const result = await checkPhrases(session, String(code).slice(0, 10), expected ?? {});
  refresh(String(code), result);
  return result;
}

export async function publishLanguageNow(code: string): Promise<LanguageResult> {
  const session = await requireRole(CONTENT_EDITORS);
  const result = await publishLanguage(session, String(code).slice(0, 10));
  refresh(String(code), result);
  return result;
}

// Empty fields mean no limit.
export async function setGeminiLimitsAction(_prev: LanguageActionState | undefined, formData: FormData): Promise<LanguageActionState> {
  const session = await requireRole(CONTENT_EDITORS);
  const code = codeFrom(formData);
  const read = (name: string) => {
    const value = String(formData.get(name) ?? "").trim();
    return value === "" ? null : Number(value);
  };
  const result = await setGeminiLimits(session, code, read("perDay"), read("perMinute"));
  refresh(code, result);
  return asFormState(result);
}
