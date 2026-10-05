import type { ComponentType } from "react";
import type { ResolvedMedia } from "@/lib/content/book";
import type { CheckResult, QuestionMode, QuestionType } from "@/lib/questions/types";
import { AreaChoiceAnswer } from "./area-choice";
import { HotspotAnswer } from "./hotspot";
import { MatchPicturesAnswer } from "./match-pictures";
import { MultiPickAnswer } from "./multi-pick";
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
  // Learn mode from the start; Practice only once the answer is checked.
  answer: unknown;
  response: unknown;
  onResponse: (response: unknown) => void;
  // Shows a short message in the frame's shared message area (e.g. "You've chosen 2…").
  onNotice: (message: string) => void;
  // A pick in progress, shared by every copy of the question (see QuestionViewState.selection).
  selection: string | null;
  onSelection: (selection: string | null) => void;
  // Checks the answer, as the Check button does (e.g. Enter on a picture). Absent where nothing is checked.
  onSubmit?: () => void;
  // True once the question is checked or revealed: answers can no longer be changed.
  locked: boolean;
  // True when the correct answer should be shown (after Check or Reveal in the Handbook, after Check in Practice).
  showCorrect: boolean;
  result: CheckResult | null;
};

// Each type step (C1–C4) adds its answer area here.
export const QUESTION_RENDERERS: Record<QuestionType, ComponentType<AnswerAreaProps> | null> = {
  single_text: SingleTextAnswer,
  single_picture: SinglePictureAnswer,
  multi_pick: MultiPickAnswer,
  hotspot: HotspotAnswer,
  area_choice: AreaChoiceAnswer,
  match_pictures: MatchPicturesAnswer,
};
