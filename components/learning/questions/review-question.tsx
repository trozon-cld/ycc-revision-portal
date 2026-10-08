"use client";

import type { ResolvedMedia } from "@/lib/content/book";
import type { ClientQuestion } from "@/lib/questions/public";
import type { CheckResult } from "@/lib/questions/types";
import { QuestionView } from "./question-view";

// A question looked at after the event (Practice report, mock test review): the correct answer highlighted,
// the candidate's own answer if there was one, and the explanation; nothing to answer.
export function ReviewQuestion({
  question,
  seed,
  label,
  media,
  answer,
  explanation,
  response = null,
  result = { answered: true, correct: false },
}: {
  question: ClientQuestion;
  // The seed used when it was answered, so the options are in the order the candidate saw.
  seed: string;
  label: string;
  media: ResolvedMedia;
  answer: unknown;
  explanation: string | null;
  response?: unknown;
  result?: CheckResult;
}) {
  return (
    <QuestionView
      question={question}
      label={label}
      media={media}
      seed={seed}
      retry={false}
      initialState={{ response, phase: "checked", result, notice: null, shown: { answer, explanation } }}
    />
  );
}
