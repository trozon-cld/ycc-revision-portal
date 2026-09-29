import type { QuestionData, QuestionMode, QuestionType, StemPictureAlign, StemPictureSize } from "./types";

export type ClientQuestion = {
  id: string;
  type: QuestionType;
  mode: QuestionMode;
  stemText: string;
  stemMediaId: string | null;
  stemMediaSize: StemPictureSize | null;
  stemMediaAlign: StemPictureAlign | null;
  content: unknown;
  // Only in learn mode, where Reveal and instant feedback happen in the browser.
  answer?: unknown;
  explanation?: string | null;
};

// The only way a question should leave the server: practice and exam never get the answer.
export function toClientQuestion(question: QuestionData & { id: string }, mode: QuestionMode): ClientQuestion {
  const base: ClientQuestion = {
    id: question.id,
    type: question.type,
    mode,
    stemText: question.stemText,
    stemMediaId: question.stemMediaId,
    stemMediaSize: question.stemMediaSize,
    stemMediaAlign: question.stemMediaAlign,
    content: question.content,
  };
  if (mode !== "learn") return base;
  return { ...base, answer: question.answer, explanation: question.explanation };
}
