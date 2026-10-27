import { optionLetter, SINGLE_TEXT_LIMITS } from "@/lib/questions/types/single-text";
import { QUESTION_LIMITS } from "@/lib/questions/validate";
import { cleanLine, cleanText, isRecord } from "@/lib/text";
import type { AudioSummary } from "./audio-files";
import type { TranslationSummary } from "./page-translations";

// Listen for question pages, shared by the server and the editors (no database code here).

// Question types with Listen so far; the others come one by one.
export const VOICE_QUESTION_TYPES = ["single_text", "multi_pick", "single_picture", "area_choice", "hotspot", "match_pictures"] as const;

export function questionTypeHasListen(type: string): boolean {
  return (VOICE_QUESTION_TYPES as readonly string[]).includes(type);
}

// What a question page reads aloud. Match pictures: `options` are its boxes' labels (the pictures aren't read).
export type QuestionText = {
  stem: string;
  // `from` (picture options): the words are the option's label, or the picture's description in Media.
  options: { id: string; text: string; from?: "label" | "description" }[];
  // Multiple answers: how many to choose.
  pick?: number;
  // Choose the area: how many outlined areas (the areas themselves aren't read).
  areas?: number;
  // Tap the area (fixed wording; the answer spot is never shown or read).
  tap?: boolean;
  // Match pictures.
  boxes?: boolean;
  // Multiple answers and Choose the area: "Choose 2 answers"; English from the fixed wording, others translated with the question.
  instruction?: string;
};

// Multiple answers and Choose the area have an instruction sentence to translate.
export function needsInstruction(english: Pick<QuestionText, "pick" | "areas">): boolean {
  return Boolean(english.pick || english.areas);
}

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
  return { stem: value.stem, options, ...(typeof value.instruction === "string" ? { instruction: value.instruction } : {}) };
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
  if (!needsInstruction(english)) return { ok: true, texts: { stem, options } };
  const instruction = cleanLine(raw.instruction ?? "");
  if (!instruction) return { ok: false, error: "The instruction is empty." };
  if (instruction.length > SINGLE_TEXT_LIMITS.optionLength) return { ok: false, error: `The instruction must be ${SINGLE_TEXT_LIMITS.optionLength} characters or fewer.` };
  return { ok: true, texts: { stem, options, instruction } };
}
