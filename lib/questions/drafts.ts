import { editableMultiPick, emptyMultiPick } from "./types/multi-pick";
import { editableSinglePicture, emptySinglePicture } from "./types/single-picture";
import { editableSingleText, emptySingleText } from "./types/single-text";
import type { QuestionType } from "./types";

type Draft = { content: unknown; answer: unknown };
type Maker = () => string;

// Starting content for a new question, per type. Types without an editor yet have none.
export function emptyDraft(type: QuestionType, makeId: Maker): Draft | null {
  if (type === "single_text") return emptySingleText(makeId);
  if (type === "single_picture") return emptySinglePicture(makeId);
  if (type === "multi_pick") return emptyMultiPick(makeId);
  return null;
}

// A stored question that no longer passes the checks still opens in the editor with what is usable.
export function editableDraft(type: QuestionType, content: unknown, answer: unknown, makeId: Maker): Draft | null {
  if (type === "single_text") return editableSingleText(content, answer, makeId);
  if (type === "single_picture") return editableSinglePicture(content, answer, makeId);
  if (type === "multi_pick") return editableMultiPick(content, answer, makeId);
  return null;
}
