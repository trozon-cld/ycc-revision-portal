// A batch item in the portal's own shapes, ready for parseQuestion / parseBlocks. Ids come from the caller:
// made up for a check, kept from the existing item on an update (so translations and results stay attached).

import type { BatchPage, BatchQuestion } from "./format";

export type ItemIds = {
  option: (position: number) => string;
  // Match pictures: the picture's own id, separate from its box (option) id.
  matchItem: (position: number) => string;
  block: (position: number) => string;
  media: (file: string) => string;
};

export function toQuestionInput(question: BatchQuestion, ids: ItemIds): Record<string, unknown> {
  const { content, answer } = contentAndAnswer(question, ids);
  // Tap the area / Choose the area: their picture is the one candidates tap, not a separate question picture.
  const tapped = question.type === "hotspot" || question.type === "area_choice";
  return {
    type: question.type,
    stemText: question.stem,
    stemMediaId: question.picture && !tapped ? ids.media(question.picture.file) : null,
    stemMediaSize: question.picture?.size ?? null,
    stemMediaAlign: question.picture?.align ?? null,
    content,
    answer,
    explanation: question.explanation,
  };
}

function contentAndAnswer(question: BatchQuestion, ids: ItemIds): { content: unknown; answer: unknown } {
  const optionIds = question.options.map((_, position) => ids.option(position));
  switch (question.type) {
    case "single_text":
      return {
        content: { options: question.options.map((option, i) => ({ id: optionIds[i], text: option.text })), keepOrder: question.keepOrder },
        answer: { correctOptionId: optionIds[question.right[0]] },
      };
    case "multi_pick":
      return {
        content: { options: question.options.map((option, i) => ({ id: optionIds[i], text: option.text })), pick: question.pick, keepOrder: question.keepOrder },
        answer: { correctOptionIds: question.right.map((i) => optionIds[i]) },
      };
    case "single_picture":
      return {
        content: {
          options: question.options.map((option, i) => ({ id: optionIds[i], mediaId: option.picture ? ids.media(option.picture) : "", label: option.text })),
          keepOrder: question.keepOrder,
        },
        answer: { correctOptionId: optionIds[question.right[0]] },
      };
    case "hotspot":
    case "area_choice": {
      // Areas aren't in a batch: they're drawn in the portal (a draft until then).
      const mediaId = question.picture ? ids.media(question.picture.file) : "";
      const label = question.label ? { label: question.label } : {};
      return question.type === "hotspot"
        ? { content: { mediaId }, answer: { areas: [], ...label } }
        : { content: { mediaId, areas: [] }, answer: label };
    }
    case "match_pictures": {
      const itemIds = question.options.map((_, position) => ids.matchItem(position));
      return {
        content: {
          items: question.options.map((option, i) => ({ id: itemIds[i], mediaId: option.picture ? ids.media(option.picture) : "" })),
          targets: question.options.map((option, i) => ({ id: optionIds[i], label: option.text })),
        },
        answer: { matches: question.options.map((_, i) => ({ targetId: optionIds[i], itemId: itemIds[i] })) },
      };
    }
  }
}

export function toBlocksInput(page: BatchPage, ids: ItemIds): unknown[] {
  return page.blocks.map((block, position) => {
    const { picture, ...rest } = block;
    return { ...rest, id: ids.block(position), ...(block.type === "picture" ? { mediaId: typeof picture === "string" ? ids.media(picture) : "" } : {}) };
  });
}
