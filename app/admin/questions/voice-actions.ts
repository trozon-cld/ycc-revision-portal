"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { isUuid } from "@/lib/ids";
import type { AudioDeleteResult, AudioLinkResult, AudioResult } from "@/lib/voice/audio-files";
import type { TranslationResult } from "@/lib/voice/page-translations";
import {
  deleteQuestionAudio,
  generateQuestionAudio,
  generateQuestionTranslation,
  markQuestionTranslationChecked,
  questionAudioPreviewLink,
  saveQuestionTranslationEdit,
} from "@/lib/voice/question-voice";

const NOT_FOUND = { ok: false, error: "This question no longer exists." } as const;

function refresh(questionId: string) {
  revalidatePath(`/admin/questions/${questionId}`, "layout");
}

// One language at a time: a translation can take up to a minute.
export async function translateQuestionLanguage(questionId: string, language: string): Promise<TranslationResult> {
  const session = await requireRole(CONTENT_EDITORS);
  if (!isUuid(questionId)) return NOT_FOUND;
  const result = await generateQuestionTranslation(session, questionId, String(language));
  if (result.ok) refresh(questionId);
  return result;
}

export async function saveQuestionTranslation(input: { questionId: string; language: string; expectedRevision: number; texts: unknown }): Promise<TranslationResult> {
  const session = await requireRole(CONTENT_EDITORS);
  const questionId = String(input?.questionId ?? "");
  const expectedRevision = Number(input?.expectedRevision);
  if (!isUuid(questionId) || !Number.isInteger(expectedRevision)) return NOT_FOUND;
  const result = await saveQuestionTranslationEdit(session, questionId, String(input.language), expectedRevision, input.texts);
  if (result.ok) refresh(questionId);
  return result;
}

export async function checkQuestionTranslation(questionId: string, language: string, expectedRevision: number): Promise<TranslationResult> {
  const session = await requireRole(CONTENT_EDITORS);
  if (!isUuid(questionId) || !Number.isInteger(Number(expectedRevision))) return NOT_FOUND;
  const result = await markQuestionTranslationChecked(session, questionId, String(language), Number(expectedRevision));
  if (result.ok) refresh(questionId);
  return result;
}

export async function generateQuestionAudioFile(questionId: string, language: string): Promise<AudioResult> {
  const session = await requireRole(CONTENT_EDITORS);
  if (!isUuid(questionId)) return NOT_FOUND;
  const result = await generateQuestionAudio(session, questionId, String(language));
  if (result.ok) refresh(questionId);
  return result;
}

export async function deleteQuestionAudioFile(questionId: string, language: string): Promise<AudioDeleteResult> {
  const session = await requireRole(CONTENT_EDITORS);
  if (!isUuid(questionId)) return NOT_FOUND;
  const result = await deleteQuestionAudio(session, questionId, String(language));
  if (result.ok) refresh(questionId);
  return result;
}

export async function questionAudioLink(questionId: string, language: string): Promise<AudioLinkResult> {
  await requireRole(CONTENT_EDITORS);
  if (!isUuid(questionId)) return NOT_FOUND;
  return questionAudioPreviewLink(questionId, String(language));
}
