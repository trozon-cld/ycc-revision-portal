import { optionLetter, SINGLE_TEXT_LIMITS } from "@/lib/questions/types/single-text";
import { QUESTION_LIMITS } from "@/lib/questions/validate";
import { cleanLine, cleanText, isRecord } from "@/lib/text";
import type { AudioSummary } from "./page-audio";
import type { TranslationSummary } from "./page-translations";

// Listen for question pages, shared by the server and the editors (no database code here).

// Question types with Listen so far; the others come one by one.
export const VOICE_QUESTION_TYPES = ["single_text"] as const;

export function questionTypeHasListen(type: string): boolean {
  return (VOICE_QUESTION_TYPES as readonly string[]).includes(type);
}

export type QuestionText = { stem: string; options: { id: string; text: string }[] };

// The status rules (status.ts) count versions; for questions "1" means made from the current English.
export const QUESTION_CURRENT_VERSION = 1;

export type QuestionVoice = {
  // null when Listen can be used; otherwise why not (type not supported yet, or not in the Handbook).
  unavailable: string | null;
  translations: TranslationSummary[];
  audio: AudioSummary[];
};

const OPTIONS_CHANGED = "The English options changed since this was translated. Translate the question again.";

// Checking translated texts.

export function readTexts(value: unknown): QuestionText | null {
  if (!isRecord(value) || typeof value.stem !== "string" || !Array.isArray(value.options)) return null;
  const options: QuestionText["options"] = [];
  for (const option of value.options) {
    if (!isRecord(option) || typeof option.id !== "string" || typeof option.text !== "string") return null;
    options.push({ id: option.id, text: option.text });
  }
  return { stem: value.stem, options };
}

export function sameOptions(english: QuestionText, texts: QuestionText): boolean {
  return english.options.length === texts.options.length && english.options.every((option, index) => texts.options[index].id === option.id);
}

// The translated question as it will be stored: the English option ids in the same order, nothing empty or too long.
export function checkQuestionTexts(english: QuestionText, value: unknown): { ok: true; texts: QuestionText } | { ok: false; error: string } {
  const raw = readTexts(value);
  if (!raw) return { ok: false, error: "The translation came back in the wrong shape." };
  if (!sameOptions(english, raw)) return { ok: false, error: OPTIONS_CHANGED };
  const stem = cleanText(raw.stem);
  if (!stem) return { ok: false, error: "The question text is empty." };
  if (stem.length > QUESTION_LIMITS.stemLength) return { ok: false, error: `The question text must be ${QUESTION_LIMITS.stemLength} characters or fewer.` };
  const options: QuestionText["options"] = [];
  for (const [index, option] of raw.options.entries()) {
    const text = cleanLine(option.text);
    const name = `Option ${optionLetter(index)}`;
    if (!text) return { ok: false, error: `${name} is empty.` };
    if (text.length > SINGLE_TEXT_LIMITS.optionLength) return { ok: false, error: `${name} must be ${SINGLE_TEXT_LIMITS.optionLength} characters or fewer.` };
    options.push({ id: option.id, text });
  }
  return { ok: true, texts: { stem, options } };
}
