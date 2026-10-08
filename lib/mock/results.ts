import { WEAK_BELOW } from "@/lib/practice/types";

// Reading one mock test's results. Pure functions, safe in the browser and on the server.

// A weakest topic in one test: at least this many of its questions, and under Practice's 70% line.
export const MOCK_WEAK_MIN_QUESTIONS = 2;
export const MOCK_WEAK_MAX = 3;

export type TopicResult = { id: string; label: string; right: number; outOf: number };

export function weakestTopics(topics: readonly TopicResult[]): TopicResult[] {
  return topics
    .filter((topic) => topic.outOf >= MOCK_WEAK_MIN_QUESTIONS && topic.right / topic.outOf < WEAK_BELOW)
    .sort((a, b) => a.right / a.outOf - b.right / b.outOf || b.outOf - a.outOf)
    .slice(0, MOCK_WEAK_MAX);
}

// What to do next: practise the weakest topics; otherwise Smart practice below the target; otherwise
// another mock test. Practice links only make sense while the test's category is still the current one.
export type NextStep = { kind: "chapters"; chapterIds: string[] } | { kind: "smart" } | { kind: "mock" };

export function nextStep(weak: readonly TopicResult[], share: number, target: number, sameCategory: boolean): NextStep {
  if (!sameCategory) return { kind: "mock" };
  if (weak.length > 0) return { kind: "chapters", chapterIds: weak.map((topic) => topic.id) };
  return share < target ? { kind: "smart" } : { kind: "mock" };
}
