// Whether a page's translation and audio in one language are there and up to date. Pure, so the page editor,
// the status list and tests all use the same rules.
export type TranslationRow = { sourceVersion: number; revision: number; status: "draft" | "checked" };
export type AudioRow = { sourceVersion: number };

export type TranslationState = "missing" | "draft" | "checked" | "outdated";
// waiting: a translated language whose translation isn't checked and up to date yet, so audio can't be made.
export type AudioState = "missing" | "ready" | "outdated" | "waiting";

export function translationState(pageVersion: number, translation: TranslationRow | null): TranslationState {
  if (!translation) return "missing";
  if (translation.sourceVersion !== pageVersion) return "outdated";
  return translation.status;
}

// English audio is made from the page; other languages from a checked, up-to-date translation.
export function audioSourceVersion(isSource: boolean, pageVersion: number, translation: TranslationRow | null): number | null {
  if (isSource) return pageVersion;
  return translationState(pageVersion, translation) === "checked" ? translation!.revision : null;
}

export function audioState(isSource: boolean, pageVersion: number, translation: TranslationRow | null, audio: AudioRow | null): AudioState {
  const source = audioSourceVersion(isSource, pageVersion, translation);
  if (!audio) return source === null ? "waiting" : "missing";
  return source !== null && audio.sourceVersion === source ? "ready" : "outdated";
}

export const TRANSLATION_STATE_LABELS: Record<TranslationState, string> = {
  missing: "Not translated",
  draft: "Draft",
  checked: "Checked",
  outdated: "Out of date",
};
