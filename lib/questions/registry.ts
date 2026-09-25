import type { AnyQuestionTypeDef } from "./define";
import { singlePictureDef } from "./types/single-picture";
import { singleTextDef } from "./types/single-text";
import type { QuestionType } from "./types";

export { checkWith, defineQuestionType, type AnyQuestionTypeDef, type QuestionTypeDef } from "./define";

type RegistryEntry = { label: string; def: AnyQuestionTypeDef | null };

// Each type step (C1–C4) fills in its `def`. A type with no def is not offered anywhere yet.
export const QUESTION_TYPES: Record<QuestionType, RegistryEntry> = {
  single_text: { label: "Single answer", def: singleTextDef },
  single_picture: { label: "Single answer, pictures", def: singlePictureDef },
  multi_pick: { label: "Multiple answers", def: null },
  hotspot: { label: "Tap the area", def: null },
};

export function questionTypeLabel(type: QuestionType): string {
  return QUESTION_TYPES[type].label;
}

export function getQuestionTypeDef(type: QuestionType): AnyQuestionTypeDef | null {
  return QUESTION_TYPES[type].def;
}

export function availableQuestionTypes(): QuestionType[] {
  return (Object.keys(QUESTION_TYPES) as QuestionType[]).filter((type) => QUESTION_TYPES[type].def !== null);
}
