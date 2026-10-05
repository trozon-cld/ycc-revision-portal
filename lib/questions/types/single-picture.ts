import { cleanLine, isRecord } from "@/lib/text";
import { isUuid } from "@/lib/ids";
import { defineQuestionType } from "../define";
import { optionLetter } from "./single-text";

// Single answer, picture options: the candidate picks one picture; exactly one is correct.
// Pictures need room, especially on a book page, so at most 4 options.

export const SINGLE_PICTURE_LIMITS = {
  minOptions: 2,
  maxOptions: 4,
  defaultOptions: 4,
  labelLength: 120,
} as const;

// Alt text comes from the picture's description in Media. The label is optional.
export type PictureOption = { id: string; mediaId: string; label?: string };
export type SinglePictureContent = { options: PictureOption[]; keepOrder: boolean };
export type SinglePictureAnswer = { correctOptionId: string };

export const singlePictureDef = defineQuestionType<SinglePictureContent, SinglePictureAnswer, string>({
  parse(content, answer) {
    if (!isRecord(content) || !Array.isArray(content.options)) return { ok: false, error: "Add the answer options." };
    const raw = content.options;
    if (raw.length < SINGLE_PICTURE_LIMITS.minOptions) {
      return { ok: false, error: `Add at least ${SINGLE_PICTURE_LIMITS.minOptions} options.` };
    }
    if (raw.length > SINGLE_PICTURE_LIMITS.maxOptions) {
      return { ok: false, error: `A picture question can have up to ${SINGLE_PICTURE_LIMITS.maxOptions} options.` };
    }

    const options: PictureOption[] = [];
    const ids = new Set<string>();
    const pictures = new Map<string, number>();
    for (const [index, item] of raw.entries()) {
      const name = `Option ${optionLetter(index)}`;
      if (!isRecord(item) || !isUuid(item.id)) return { ok: false, error: `${name} is not valid. Remove it and add it again.` };
      const id = item.id.toLowerCase();
      if (ids.has(id)) return { ok: false, error: `${name} is a duplicate. Remove it and add it again.` };
      if (!isUuid(item.mediaId)) return { ok: false, error: `${name} has no picture. Choose one.` };
      const mediaId = item.mediaId.toLowerCase();
      const same = pictures.get(mediaId);
      if (same !== undefined) {
        return { ok: false, error: `Options ${optionLetter(same)} and ${optionLetter(index)} use the same picture. Choose a different one.` };
      }
      const label = cleanLine(item.label);
      if (label.length > SINGLE_PICTURE_LIMITS.labelLength) {
        return { ok: false, error: `${name}'s label must be ${SINGLE_PICTURE_LIMITS.labelLength} characters or fewer.` };
      }
      ids.add(id);
      pictures.set(mediaId, index);
      options.push(label ? { id, mediaId, label } : { id, mediaId });
    }

    const correct = isRecord(answer) && isUuid(answer.correctOptionId) ? answer.correctOptionId.toLowerCase() : null;
    if (!correct || !ids.has(correct)) return { ok: false, error: "Choose the correct answer." };

    return { ok: true, content: { options, keepOrder: content.keepOrder === true }, answer: { correctOptionId: correct } };
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

  mediaIds(content) {
    return content.options.map((option) => option.mediaId);
  },
});

// Editor drafts: options may still be missing their picture (mediaId "").
export type PictureOptionDraft = { id: string; mediaId: string; label: string };

export function emptySinglePicture(makeId: () => string) {
  return {
    content: {
      options: Array.from({ length: SINGLE_PICTURE_LIMITS.defaultOptions }, (): PictureOptionDraft => ({ id: makeId(), mediaId: "", label: "" })),
      keepOrder: false,
    },
    answer: { correctOptionId: "" },
  };
}

// Keeps whatever usable options a stored question has, so the editor can still open it.
export function editableSinglePicture(content: unknown, answer: unknown, makeId: () => string) {
  const raw = isRecord(content) && Array.isArray(content.options) ? content.options : [];
  const options: PictureOptionDraft[] = raw
    .filter(isRecord)
    .slice(0, SINGLE_PICTURE_LIMITS.maxOptions)
    .map((item) => ({
      id: isUuid(item.id) ? item.id.toLowerCase() : makeId(),
      mediaId: isUuid(item.mediaId) ? item.mediaId.toLowerCase() : "",
      label: typeof item.label === "string" ? item.label : "",
    }));
  while (options.length < SINGLE_PICTURE_LIMITS.minOptions) options.push({ id: makeId(), mediaId: "", label: "" });
  const correct = isRecord(answer) && typeof answer.correctOptionId === "string" ? answer.correctOptionId.toLowerCase() : "";
  return {
    content: { options, keepOrder: isRecord(content) && content.keepOrder === true },
    answer: { correctOptionId: options.some((option) => option.id === correct) ? correct : "" },
  };
}
