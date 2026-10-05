import { plainText } from "@/lib/content/inline";
import { cleanLine, isRecord } from "@/lib/text";
import { isUuid } from "@/lib/ids";
import { defineQuestionType } from "../define";

// Single answer, text options: the candidate picks one option; exactly one is correct.

export const SINGLE_TEXT_LIMITS = {
  minOptions: 2,
  maxOptions: 6,
  defaultOptions: 4,
  optionLength: 300,
} as const;

export type SingleTextOption = { id: string; text: string };
// keepOrder: show options as written even where they are normally shuffled (Practice, Mock).
export type SingleTextContent = { options: SingleTextOption[]; keepOrder: boolean };
export type SingleTextAnswer = { correctOptionId: string };

export function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

export const singleTextDef = defineQuestionType<SingleTextContent, SingleTextAnswer, string>({
  parse(content, answer) {
    if (!isRecord(content) || !Array.isArray(content.options)) return { ok: false, error: "Add the answer options." };
    const raw = content.options;
    if (raw.length < SINGLE_TEXT_LIMITS.minOptions) {
      return { ok: false, error: `Add at least ${SINGLE_TEXT_LIMITS.minOptions} options.` };
    }
    if (raw.length > SINGLE_TEXT_LIMITS.maxOptions) {
      return { ok: false, error: `A question can have up to ${SINGLE_TEXT_LIMITS.maxOptions} options.` };
    }

    const options: SingleTextOption[] = [];
    const ids = new Set<string>();
    const texts = new Map<string, number>();
    for (const [index, item] of raw.entries()) {
      const name = `Option ${optionLetter(index)}`;
      if (!isRecord(item) || !isUuid(item.id)) return { ok: false, error: `${name} is not valid. Remove it and add it again.` };
      const id = item.id.toLowerCase();
      if (ids.has(id)) return { ok: false, error: `${name} is a duplicate. Remove it and add it again.` };
      const text = cleanLine(item.text);
      if (!text) return { ok: false, error: `${name} is empty.` };
      if (text.length > SINGLE_TEXT_LIMITS.optionLength) {
        return { ok: false, error: `${name} must be ${SINGLE_TEXT_LIMITS.optionLength} characters or fewer.` };
      }
      const key = plainText(text).toLowerCase();
      const same = texts.get(key);
      if (same !== undefined) {
        return { ok: false, error: `Options ${optionLetter(same)} and ${optionLetter(index)} are the same. Make each option different.` };
      }
      ids.add(id);
      texts.set(key, index);
      options.push({ id, text });
    }

    const correct = isRecord(answer) && isUuid(answer.correctOptionId) ? answer.correctOptionId.toLowerCase() : null;
    if (!correct || !ids.has(correct)) return { ok: false, error: "Choose the correct answer." };

    return {
      ok: true,
      content: { options, keepOrder: content.keepOrder === true },
      answer: { correctOptionId: correct },
    };
  },

  parseResponse(raw, content) {
    if (typeof raw !== "string") return null;
    const id = raw.toLowerCase();
    return content.options.some((option) => option.id === id) ? id : null;
  },

  check(_content, answer, response) {
    return response === answer.correctOptionId;
  },

  sampleWrongResponse(content, answer) {
    return content.options.find((option) => option.id !== answer.correctOptionId)?.id ?? null;
  },

  mediaIds() {
    return [];
  },
});

// A new question's starting point: four empty options (A–D) and no correct answer yet.
export function emptySingleText(makeId: () => string): { content: SingleTextContent; answer: { correctOptionId: string } } {
  return {
    content: {
      options: Array.from({ length: SINGLE_TEXT_LIMITS.defaultOptions }, () => ({ id: makeId(), text: "" })),
      keepOrder: false,
    },
    answer: { correctOptionId: "" },
  };
}

// Keeps whatever usable options a stored question has, so the editor can still open it.
export function editableSingleText(content: unknown, answer: unknown, makeId: () => string) {
  const raw = isRecord(content) && Array.isArray(content.options) ? content.options : [];
  const options = raw
    .filter(isRecord)
    .slice(0, SINGLE_TEXT_LIMITS.maxOptions)
    .map((item) => ({ id: isUuid(item.id) ? item.id.toLowerCase() : makeId(), text: typeof item.text === "string" ? item.text : "" }));
  while (options.length < SINGLE_TEXT_LIMITS.minOptions) options.push({ id: makeId(), text: "" });
  const correct = isRecord(answer) && typeof answer.correctOptionId === "string" ? answer.correctOptionId.toLowerCase() : "";
  return {
    content: { options, keepOrder: isRecord(content) && content.keepOrder === true },
    answer: { correctOptionId: options.some((option) => option.id === correct) ? correct : "" },
  };
}
