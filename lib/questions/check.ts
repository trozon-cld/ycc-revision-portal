import { checkWith, getQuestionTypeDef } from "./registry";
import type { CheckResult, QuestionData } from "./types";

// Marks a candidate's response. The response is untrusted; an unreadable one counts as unanswered.
// Returns null only when the question's type isn't built yet.
export function checkAnswer(
  question: Pick<QuestionData, "type" | "content" | "answer">,
  response: unknown
): CheckResult | null {
  const def = getQuestionTypeDef(question.type);
  if (!def) return null;
  return checkWith(def, question.content, question.answer, response);
}
