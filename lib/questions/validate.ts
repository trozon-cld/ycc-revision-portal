import { getQuestionTypeDef } from "./registry";
import { cleanText, isRecord, isUuid } from "./text";
import { isQuestionType, type QuestionData } from "./types";

export { cleanText, isUuid };

export const QUESTION_LIMITS = {
  stemLength: 1000,
  explanationLength: 2000,
} as const;

export type ParsedQuestion = QuestionData & { mediaIds: string[] };
export type QuestionParseResult = { ok: true; question: ParsedQuestion } | { ok: false; error: string };

// Checks an untrusted question (from the editor or the database) and returns a clean copy,
// plus every picture it uses. Text keeps single line breaks; **bold** is the only formatting.
export function parseQuestion(raw: unknown): QuestionParseResult {
  if (!isRecord(raw)) return { ok: false, error: "This is not a question." };
  if (!isQuestionType(raw.type)) return { ok: false, error: "Choose a question type." };

  const def = getQuestionTypeDef(raw.type);
  if (!def) return { ok: false, error: "This question type isn't available yet." };

  const stemText = cleanText(raw.stemText);
  if (!stemText) return { ok: false, error: "Question text is required." };
  if (stemText.length > QUESTION_LIMITS.stemLength) {
    return { ok: false, error: `Question text must be ${QUESTION_LIMITS.stemLength} characters or fewer.` };
  }

  let stemMediaId: string | null = null;
  if (raw.stemMediaId !== null && raw.stemMediaId !== undefined && raw.stemMediaId !== "") {
    if (!isUuid(raw.stemMediaId)) return { ok: false, error: "The question picture is not valid. Choose it again." };
    stemMediaId = raw.stemMediaId.toLowerCase();
    if (raw.type === "hotspot") return { ok: false, error: "This question uses the picture candidates tap. Remove the separate question picture." };
  }

  // Same rules as picture blocks: "full" and "center" are the defaults and are stored as empty.
  let stemMediaSize: QuestionData["stemMediaSize"] = null;
  let stemMediaAlign: QuestionData["stemMediaAlign"] = null;
  if (stemMediaId) {
    const size = raw.stemMediaSize ?? null;
    if (size !== null && !["small", "medium", "large", "full"].includes(size as string)) {
      return { ok: false, error: "Picture size must be small, medium, large or full width." };
    }
    const align = raw.stemMediaAlign ?? null;
    if (align !== null && !["left", "center", "right"].includes(align as string)) {
      return { ok: false, error: "Picture position must be left, centre or right." };
    }
    if (size !== null && size !== "full") stemMediaSize = size as NonNullable<QuestionData["stemMediaSize"]>;
    if (stemMediaSize && align !== null && align !== "center") stemMediaAlign = align as NonNullable<QuestionData["stemMediaAlign"]>;
  }

  const explanation = cleanText(raw.explanation) || null;
  if (explanation && explanation.length > QUESTION_LIMITS.explanationLength) {
    return { ok: false, error: `Explanation must be ${QUESTION_LIMITS.explanationLength} characters or fewer.` };
  }

  const parsed = def.parse(raw.content, raw.answer);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const mediaIds = [...new Set([...(stemMediaId ? [stemMediaId] : []), ...def.mediaIds(parsed.content)])];
  return {
    ok: true,
    question: {
      type: raw.type,
      stemText,
      stemMediaId,
      stemMediaSize,
      stemMediaAlign,
      content: parsed.content,
      answer: parsed.answer,
      explanation,
      mediaIds,
    },
  };
}
