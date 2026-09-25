import { plainText } from "@/lib/content/inline";
import { defineQuestionType } from "../define";
import { cleanLine, isRecord, isUuid } from "../text";
import { optionLetter } from "./single-text";

// Multiple answers ("pick N"): the candidate chooses exactly N options. All or nothing: correct only
// when the chosen set is exactly the correct set.

export const MULTI_PICK_LIMITS = {
  minOptions: 3,
  maxOptions: 6,
  defaultOptions: 5,
  optionLength: 300,
  picks: [2, 3] as const,
} as const;

export type MultiPickOption = { id: string; text: string };
export type MultiPickContent = { options: MultiPickOption[]; pick: number; keepOrder: boolean };
export type MultiPickAnswer = { correctOptionIds: string[] };

export function choosePrompt(pick: number): string {
  return `Choose ${pick} answers`;
}

export const multiPickDef = defineQuestionType<MultiPickContent, MultiPickAnswer, string[]>({
  parse(content, answer) {
    if (!isRecord(content) || !Array.isArray(content.options)) return { ok: false, error: "Add the answer options." };
    const raw = content.options;
    if (raw.length < MULTI_PICK_LIMITS.minOptions) {
      return { ok: false, error: `Add at least ${MULTI_PICK_LIMITS.minOptions} options.` };
    }
    if (raw.length > MULTI_PICK_LIMITS.maxOptions) {
      return { ok: false, error: `A question can have up to ${MULTI_PICK_LIMITS.maxOptions} options.` };
    }
    const pick = content.pick;
    if (typeof pick !== "number" || !(MULTI_PICK_LIMITS.picks as readonly number[]).includes(pick)) {
      return { ok: false, error: "Choose how many answers candidates pick (2 or 3)." };
    }
    if (pick >= raw.length) return { ok: false, error: `With ${pick} answers to pick, add at least ${pick + 1} options.` };

    const options: MultiPickOption[] = [];
    const ids = new Set<string>();
    const texts = new Map<string, number>();
    for (const [index, item] of raw.entries()) {
      const name = `Option ${optionLetter(index)}`;
      if (!isRecord(item) || !isUuid(item.id)) return { ok: false, error: `${name} is not valid. Remove it and add it again.` };
      const id = item.id.toLowerCase();
      if (ids.has(id)) return { ok: false, error: `${name} is a duplicate. Remove it and add it again.` };
      const text = cleanLine(item.text);
      if (!text) return { ok: false, error: `${name} is empty.` };
      if (text.length > MULTI_PICK_LIMITS.optionLength) {
        return { ok: false, error: `${name} must be ${MULTI_PICK_LIMITS.optionLength} characters or fewer.` };
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

    const marked = isRecord(answer) && Array.isArray(answer.correctOptionIds) ? answer.correctOptionIds : [];
    const correct = [...new Set(marked.filter(isUuid).map((id) => id.toLowerCase()))].filter((id) => ids.has(id));
    if (correct.length !== pick) {
      return { ok: false, error: `Mark exactly ${pick} correct answers (${correct.length} marked).` };
    }
    // Stored in option order, so the same answer always looks the same.
    const ordered = options.map((option) => option.id).filter((id) => correct.includes(id));
    return { ok: true, content: { options, pick, keepOrder: content.keepOrder === true }, answer: { correctOptionIds: ordered } };
  },

  // A response is a list of chosen option ids; an empty list is "not answered".
  parseResponse(raw, content) {
    if (!Array.isArray(raw)) return null;
    const known = new Set(content.options.map((option) => option.id));
    const chosen = [...new Set(raw.filter((id): id is string => typeof id === "string").map((id) => id.toLowerCase()))];
    if (chosen.length === 0 || chosen.length > content.pick || chosen.some((id) => !known.has(id))) return null;
    return chosen;
  },

  check(_content, answer, response) {
    return response.length === answer.correctOptionIds.length && response.every((id) => answer.correctOptionIds.includes(id));
  },

  mediaIds() {
    return [];
  },

  incomplete(content, raw) {
    const count = Array.isArray(raw) ? raw.length : 0;
    const missing = content.pick - count;
    if (count === 0 || missing <= 0) return null;
    return `Choose ${missing} more answer${missing === 1 ? "" : "s"}.`;
  },

  sampleWrongResponse(content, answer) {
    return content.options
      .filter((option) => !answer.correctOptionIds.includes(option.id))
      .slice(0, content.pick)
      .map((option) => option.id);
  },
});

export function emptyMultiPick(makeId: () => string) {
  return {
    content: {
      options: Array.from({ length: MULTI_PICK_LIMITS.defaultOptions }, () => ({ id: makeId(), text: "" })),
      pick: 2,
      keepOrder: false,
    },
    answer: { correctOptionIds: [] as string[] },
  };
}

// Keeps whatever usable options a stored question has, so the editor can still open it.
export function editableMultiPick(content: unknown, answer: unknown, makeId: () => string) {
  const raw = isRecord(content) && Array.isArray(content.options) ? content.options : [];
  const options = raw
    .filter(isRecord)
    .slice(0, MULTI_PICK_LIMITS.maxOptions)
    .map((item) => ({ id: isUuid(item.id) ? item.id.toLowerCase() : makeId(), text: typeof item.text === "string" ? item.text : "" }));
  while (options.length < MULTI_PICK_LIMITS.minOptions) options.push({ id: makeId(), text: "" });
  const pick = isRecord(content) && (content.pick === 2 || content.pick === 3) ? content.pick : 2;
  const marked = isRecord(answer) && Array.isArray(answer.correctOptionIds) ? answer.correctOptionIds : [];
  const known = new Set(options.map((option) => option.id));
  return {
    content: { options, pick, keepOrder: isRecord(content) && content.keepOrder === true },
    answer: { correctOptionIds: options.map((option) => option.id).filter((id) => known.has(id) && marked.some((m) => typeof m === "string" && m.toLowerCase() === id)) },
  };
}
