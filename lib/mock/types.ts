import type { ResolvedMedia } from "@/lib/content/book";
import type { ClientQuestion } from "@/lib/questions/public";
import type { NextStep, TopicResult } from "./results";

// Mock test shapes shared by the server and the browser. Pure types and constants only.

// A full mock test, as in the real test: 50 questions in 45 minutes.
export const MOCK_QUESTIONS = 50;
export const MOCK_MINUTES = 45;
// Readiness target: 45 of 50 (90%), never described as a pass.
export const READINESS_TARGET = 0.9;
// Tests that keep their questions and answers for review; older ones keep totals only.
export const MOCK_KEEP_ANSWERS = 10;
// Answers arriving this long after the deadline still count (slow networks).
export const SAVE_GRACE_SECONDS = 10;

// Time for a test of `total` questions: the full test's pace, rounded up to whole minutes.
export function mockMinutes(total: number): number {
  return Math.max(1, Math.ceil((total * MOCK_MINUTES) / MOCK_QUESTIONS));
}

// A score as a whole percentage (0 when nothing counted).
export function scorePercent(right: number, outOf: number): number {
  return outOf > 0 ? Math.round((right / outOf) * 100) : 0;
}

// "32 minutes left", for pages that show the time without a running clock.
export function timeLeftText(seconds: number): string {
  if (seconds < 60) return "Less than a minute left";
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} left`;
}

export type MockEnd = "submitted" | "time_up" | "away" | "moved";

// The start page: what a test would hold now, and the one in progress if any.
export type MockHome = {
  categoryName: string;
  // Questions a new test would have (up to 50) and its time.
  size: number;
  minutes: number;
  open: OpenMock | null;
};

export type OpenMock = { id: string; total: number; answered: number; secondsLeft: number };

// A test in progress, as the test screen gets it: every question without its answer.
export type MockRun = {
  attemptId: string;
  total: number;
  position: number;
  secondsLeft: number;
  // A question deleted from the bank since the start is null.
  questions: (ClientQuestion | null)[];
  // Same order as `questions`; null = not answered.
  responses: unknown[];
  flags: boolean[];
  media: ResolvedMedia;
};

// A test that has ended, as its results page shows it. Topics are chapters, in Handbook order.
export type MockResults = {
  how: MockEnd;
  rightCount: number;
  outOf: number;
  answered: number;
  total: number;
  secondsTaken: number;
  topics: TopicResult[];
  weakest: TopicResult[];
  next: NextStep;
  // Only the newest tests keep their questions and answers for review.
  answersKept: boolean;
  // Wrong or unanswered questions that can be practised now (in the current category's Practice).
  practiceCount: number;
};

// An ended test in the candidate's history.
export type MockHistoryEntry = { id: string; endedAt: string; how: MockEnd; rightCount: number; outOf: number; secondsTaken: number };
export type MockHistory = { count: number; best: MockHistoryEntry | null; items: MockHistoryEntry[] };

export type MockMark = "R" | "W" | "U";

// One question of an ended test, with the candidate's answer and the correct one.
export type MockReviewItem = {
  position: number;
  mark: MockMark;
  flaggedInTest: boolean;
  chapterLabel: string;
  question: ClientQuestion;
  response: unknown;
  answer: unknown;
  explanation: string | null;
  // Flag for review in Practice: its current state, or null where the question isn't in Practice now.
  practiceFlag: boolean | null;
};

export type MockReview = { kept: boolean; total: number; items: MockReviewItem[]; media: ResolvedMedia };

export type MockChange = { position: number; response?: unknown; flagged?: boolean };
export type MockSaveReply = { ok: true; secondsLeft: number } | { ok: false; reason: "ended" | "invalid" };
