import { editableAreaChoice, emptyAreaChoice } from "./types/area-choice";
import { editableHotspot, emptyHotspot } from "./types/hotspot";
import { editableMatchPictures, emptyMatchPictures } from "./types/match-pictures";
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
  if (type === "hotspot") return emptyHotspot();
  if (type === "area_choice") return emptyAreaChoice();
  if (type === "match_pictures") return emptyMatchPictures(makeId);
  return null;
}

// A stored question that no longer passes the checks still opens in the editor with what is usable.
export function editableDraft(type: QuestionType, content: unknown, answer: unknown, makeId: Maker): Draft | null {
  if (type === "single_text") return editableSingleText(content, answer, makeId);
  if (type === "single_picture") return editableSinglePicture(content, answer, makeId);
  if (type === "multi_pick") return editableMultiPick(content, answer, makeId);
  if (type === "hotspot") return editableHotspot(content, answer, makeId);
  if (type === "area_choice") return editableAreaChoice(content, answer, makeId);
  if (type === "match_pictures") return editableMatchPictures(content, answer, makeId);
  return null;
}
