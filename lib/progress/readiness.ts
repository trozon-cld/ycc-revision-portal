// The readiness score on My progress. Pure, so it can be tested; a guide, never a prediction of the real test.

// 40% latest mock + 30% average mock + 20% Handbook completion + 10% practised chapters that aren't weak.
export const READINESS_PARTS = [
  { key: "latest", name: "Latest mock test", weight: 40 },
  { key: "average", name: "Average mock test score", weight: 30 },
  { key: "handbook", name: "Handbook completion", weight: 20 },
  { key: "areas", name: "Practised chapters that aren’t weak", weight: 10 },
] as const;
export type ReadinessKey = (typeof READINESS_PARTS)[number]["key"];

// Lowest score for each label, highest first. 90%+ is "Well prepared" (no "pass" wording).
export const READINESS_LABELS = [
  { from: 90, label: "Well prepared" },
  { from: 70, label: "Almost ready" },
  { from: 50, label: "Getting there" },
  { from: 0, label: "Needs more practice" },
] as const;

// Each part as a share (0–1); null where the category has nothing for it (left out, its weight shared).
export type ReadinessInput = { latest: number; average: number; handbook: number | null; areas: number | null };
export type ReadinessPart = { key: ReadinessKey; name: string; weight: number; percent: number };
export type Readiness = { score: number; label: string; parts: ReadinessPart[] };

export function readinessScore(input: ReadinessInput): Readiness {
  const used = READINESS_PARTS.filter((part) => input[part.key] !== null);
  const totalWeight = used.reduce((sum, part) => sum + part.weight, 0);
  const parts = used.map((part) => ({ key: part.key, name: part.name, weight: part.weight / totalWeight, percent: Math.round((input[part.key] ?? 0) * 100) }));
  const score = Math.round(used.reduce((sum, part) => sum + (input[part.key] ?? 0) * (part.weight / totalWeight), 0) * 100);
  return { score, label: readinessLabel(score), parts };
}

export function readinessLabel(score: number): string {
  return (READINESS_LABELS.find((item) => score >= item.from) ?? READINESS_LABELS[READINESS_LABELS.length - 1]).label;
}
