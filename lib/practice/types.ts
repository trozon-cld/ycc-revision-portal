import type { ResolvedMedia } from "@/lib/content/book";
import type { ClientQuestion } from "@/lib/questions/public";
import type { CheckResult, QuestionType } from "@/lib/questions/types";

// Practice shapes shared by the server and the browser. Pure types and constants only.

export const PRACTICE_WAYS = ["smart", "chapters", "types", "all"] as const;
export type PracticeWay = (typeof PRACTICE_WAYS)[number];
// "retry" is a practice made from the wrong answers of the last one.
export type PracticeMode = PracticeWay | "retry";

export const PRACTICE_SIZES = [10, 20, 30] as const;

// Candidate-facing names; the admin names (lib/questions/registry.ts) are written for authors.
export const PRACTICE_TYPE_NAMES: Record<QuestionType, string> = {
  single_text: "Choose one answer",
  single_picture: "Choose a picture",
  multi_pick: "Choose more than one",
  hotspot: "Tap the picture",
  area_choice: "Choose the area",
  match_pictures: "Match the pictures",
};

export function isPracticeWay(value: unknown): value is PracticeWay {
  return typeof value === "string" && (PRACTICE_WAYS as readonly string[]).includes(value);
}

// What the setup page offers: question counts in the current category's practice pool.
export type PracticeOptions = {
  categoryName: string;
  total: number;
  sections: { label: string; chapters: { id: string; label: string; count: number }[] }[];
  types: { type: QuestionType; name: string; count: number }[];
};

// The question on screen. `checked` is set when it was already answered (e.g. after a reload).
export type PracticeStep = {
  sessionId: string;
  position: number;
  total: number;
  answered: number;
  rightCount: number;
  chapterLabel: string;
  question: ClientQuestion;
  media: ResolvedMedia;
  checked: PracticeChecked | null;
};

export type PracticeChecked = CheckResult & { answer: unknown; explanation: string | null };

export type PracticeCheckReply = { ok: true; checked: PracticeChecked } | { ok: false; reason: "gone" | "moved" | "invalid" };
export type PracticeNextReply = { ok: true; step: PracticeStep } | { ok: true; finished: true } | { ok: false; reason: "moved" };
