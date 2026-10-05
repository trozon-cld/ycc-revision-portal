"use client";

import type { ResolvedMedia } from "@/lib/content/book";
import type { PracticeChecked } from "@/lib/practice/types";
import type { ClientQuestion } from "@/lib/questions/public";
import { QuestionView } from "@/components/learning/questions/question-view";

// A missed question on the report: the correct answer highlighted and the explanation; nothing to answer.
export function ReviewQuestion({
  sessionId,
  question,
  checked,
  media,
}: {
  sessionId: string;
  question: ClientQuestion;
  checked: PracticeChecked;
  media: ResolvedMedia;
}) {
  // Same seed as the run, so the answers are in the order the candidate saw.
  return (
    <QuestionView
      question={question}
      label="Correct answer"
      media={media}
      seed={`${sessionId}:${question.id}`}
      retry={false}
      initialState={{
        response: null,
        phase: "checked",
        result: { answered: true, correct: false },
        notice: null,
        shown: { answer: checked.answer, explanation: checked.explanation },
      }}
    />
  );
}
