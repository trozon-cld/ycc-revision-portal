import type { ResolvedMedia } from "@/lib/content/book";
import type { ClientQuestion } from "@/lib/questions/public";

// Mock test shapes shared by the server and the browser. Pure types and constants only.

// A full mock test, as in the real test: 50 questions in 45 minutes.
export const MOCK_QUESTIONS = 50;
export const MOCK_MINUTES = 45;
// Readiness target: 45 of 50 (90%), never described as a pass.
export const READINESS_TARGET = 0.9;
// Answers arriving this long after the deadline still count (slow networks).
export const SAVE_GRACE_SECONDS = 10;

// Time for a test of `total` questions: the full test's pace, rounded up to whole minutes.
export function mockMinutes(total: number): number {
  return Math.max(1, Math.ceil((total * MOCK_MINUTES) / MOCK_QUESTIONS));
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

// A test that has ended, for the screen shown after it (the full results come in E5b).
export type MockSummary = {
  how: MockEnd;
  rightCount: number;
  outOf: number;
  answered: number;
  total: number;
  secondsTaken: number;
};

export type MockChange = { position: number; response?: unknown; flagged?: boolean };
export type MockSaveReply = { ok: true; secondsLeft: number } | { ok: false; reason: "ended" | "invalid" };
