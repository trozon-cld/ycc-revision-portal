import type { ComponentType } from "react";
import type { ResolvedMedia } from "@/lib/content/book";
import type { CheckResult, QuestionMode, QuestionType } from "@/lib/questions/types";
import { SinglePictureAnswer } from "./single-picture";
import { SingleTextAnswer } from "./single-text";

// What every type's answer area receives from QuestionView. The frame owns the state.
export type AnswerAreaProps = {
  questionId: string;
  mode: QuestionMode;
  // Same seed, same shuffled order (e.g. attempt id + question id), so a reload doesn't reshuffle.
  seed: string;
  content: unknown;
  // Pictures the answer area may show (e.g. picture options), keyed by media id.
  media: ResolvedMedia;
  // Only present in learn mode.
  answer: unknown;
  response: unknown;
  onResponse: (response: unknown) => void;
  // True once the question is checked or revealed: answers can no longer be changed.
  locked: boolean;
  // True when the correct answer should be shown (learn mode, after Check or Reveal).
  showCorrect: boolean;
  result: CheckResult | null;
};

// Each type step (C1–C4) adds its answer area here.
export const QUESTION_RENDERERS: Record<QuestionType, ComponentType<AnswerAreaProps> | null> = {
  single_text: SingleTextAnswer,
  single_picture: SinglePictureAnswer,
  multi_pick: null,
  hotspot: null,
};
