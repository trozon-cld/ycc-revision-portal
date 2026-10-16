"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { isUuid } from "@/lib/ids";
import {
  generateTranslation,
  markTranslationChecked,
  saveTranslationEdit,
  type TranslationResult,
} from "@/lib/voice/page-translations";

const NOT_FOUND: TranslationResult = { ok: false, error: "This page no longer exists." };

function refresh(pageId: string) {
  revalidatePath(`/admin/handbook/pages/${pageId}`, "layout");
}

// One language at a time: a translation can take up to a minute.
export async function translatePageLanguage(pageId: string, language: string): Promise<TranslationResult> {
  const session = await requireRole(CONTENT_EDITORS);
  if (!isUuid(pageId)) return NOT_FOUND;
  const result = await generateTranslation(session, pageId, String(language));
  if (result.ok) refresh(pageId);
  return result;
}

export async function saveTranslation(input: { pageId: string; language: string; expectedRevision: number; blocks: unknown }): Promise<TranslationResult> {
  const session = await requireRole(CONTENT_EDITORS);
  const pageId = String(input?.pageId ?? "");
  const expectedRevision = Number(input?.expectedRevision);
  if (!isUuid(pageId) || !Number.isInteger(expectedRevision)) return NOT_FOUND;
  const result = await saveTranslationEdit(session, pageId, String(input.language), expectedRevision, input.blocks);
  if (result.ok) refresh(pageId);
  return result;
}

export async function checkTranslation(pageId: string, language: string, expectedRevision: number): Promise<TranslationResult> {
  const session = await requireRole(CONTENT_EDITORS);
  if (!isUuid(pageId) || !Number.isInteger(Number(expectedRevision))) return NOT_FOUND;
  const result = await markTranslationChecked(session, pageId, String(language), Number(expectedRevision));
  if (result.ok) refresh(pageId);
  return result;
}
