import { getQuestionTypeDef } from "./registry";
import { isQuestionType, type QuestionData } from "./types";

export const QUESTION_LIMITS = {
  stemLength: 1000,
  explanationLength: 2000,
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

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
      content: parsed.content,
      answer: parsed.answer,
      explanation,
      mediaIds,
    },
  };
}

export function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
