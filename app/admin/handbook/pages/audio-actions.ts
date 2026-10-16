"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { isUuid } from "@/lib/ids";
import {
  audioPreviewLink,
  deleteAudio,
  generateAudio,
  type AudioDeleteResult,
  type AudioLinkResult,
  type AudioResult,
} from "@/lib/voice/page-audio";

const NOT_FOUND = { ok: false, error: "This page no longer exists." } as const;

function refresh(pageId: string) {
  revalidatePath(`/admin/handbook/pages/${pageId}`, "layout");
}

// One language at a time: a long page can take a minute or more.
export async function generatePageAudio(pageId: string, language: string): Promise<AudioResult> {
  const session = await requireRole(CONTENT_EDITORS);
  if (!isUuid(pageId)) return NOT_FOUND;
  const result = await generateAudio(session, pageId, String(language));
  if (result.ok) refresh(pageId);
  return result;
}

export async function deletePageAudio(pageId: string, language: string): Promise<AudioDeleteResult> {
  const session = await requireRole(CONTENT_EDITORS);
  if (!isUuid(pageId)) return NOT_FOUND;
  const result = await deleteAudio(session, pageId, String(language));
  if (result.ok) refresh(pageId);
  return result;
}

export async function pageAudioLink(pageId: string, language: string): Promise<AudioLinkResult> {
  await requireRole(CONTENT_EDITORS);
  if (!isUuid(pageId)) return NOT_FOUND;
  return audioPreviewLink(pageId, String(language));
}
