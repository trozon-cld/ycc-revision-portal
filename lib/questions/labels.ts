import { plainText } from "@/lib/content/inline";

export function questionRef(refNo: number): string {
  return `Q${String(refNo).padStart(4, "0")}`;
}

// "42", "Q42" or "q0042" → 42; anything else → null.
export function parseQuestionRef(value: string): number | null {
  const match = /^q?0*(\d{1,9})$/i.exec(value.trim());
  if (!match) return null;
  const refNo = Number(match[1]);
  return refNo > 0 && refNo <= 2147483647 ? refNo : null;
}

const EXCERPT_LENGTH = 60;

// Activity log label, e.g. "Q0042 · Which of these must you…".
export function questionLogLabel(refNo: number, stemText: string): string {
  const text = plainText(stemText).replace(/\s+/g, " ").trim();
  const excerpt = text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…` : text;
  return `${questionRef(refNo)} · ${excerpt}`;
}
