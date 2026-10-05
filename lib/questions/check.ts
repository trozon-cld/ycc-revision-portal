import { checkWith, getQuestionTypeDef } from "./registry";
import type { CheckResult, QuestionData } from "./types";

// Responses larger than this are refused unread (no real answer comes close).
const RESPONSE_SIZE_LIMIT = 4000;

export function isOversizedResponse(response: unknown): boolean {
  return (JSON.stringify(response ?? null)?.length ?? 0) > RESPONSE_SIZE_LIMIT;
}

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
