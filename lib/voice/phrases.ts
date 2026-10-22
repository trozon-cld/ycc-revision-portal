import { VOICE_PHRASE_MAX_LENGTH } from "./limits";
import { COUNTED_PHRASES, PHRASE_KEYS, type PhraseKey } from "./languages";

// The fixed spoken phrases as staff see them: what each one is for (Manage languages, L2).
export const PHRASE_INFO: Record<PhraseKey, { label: string; use: string }> = {
  key_point: { label: "Key point box", use: "Read before the text of a Key point box." },
  remember: { label: "Remember box", use: "Read before the text of a Remember box." },
  question: { label: "Question", use: "Read before a question page's question." },
  option: { label: "Option", use: "Read before each answer, followed by its letter (\"Option A\")." },
  choose: { label: "Multiple answers", use: "Read after the question; {n} is how many answers to choose." },
  choose_area: { label: "Choose the area", use: "Read after the question; {n} is how many outlined areas the picture has." },
  tap_area: { label: "Tap the area", use: "Read after the question." },
  match_boxes: { label: "Match pictures", use: "Read after the question." },
  boxes_are: { label: "Match pictures: boxes", use: "Read before the box labels." },
};

export type PhraseTexts = Record<PhraseKey, string>;

// Every phrase present, trimmed, not too long, and {n} kept where a number goes.
export function checkPhraseTexts(input: unknown): { ok: true; texts: PhraseTexts } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Fill in every phrase." };
  const texts = {} as PhraseTexts;
  for (const key of PHRASE_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    const text = typeof value === "string" ? value.trim() : "";
    const label = PHRASE_INFO[key].label;
    if (!text) return { ok: false, error: `Fill in "${label}".` };
    if (text.length > VOICE_PHRASE_MAX_LENGTH) return { ok: false, error: `"${label}" can be at most ${VOICE_PHRASE_MAX_LENGTH} characters.` };
    if (COUNTED_PHRASES.includes(key) && !text.includes("{n}")) return { ok: false, error: `"${label}" must keep {n}, where the number goes.` };
    texts[key] = text;
  }
  return { ok: true, texts };
}
