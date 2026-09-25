import type { CheckResult, QuestionType } from "./types";

type Parsed<C, A> = { ok: true; content: C; answer: A } | { ok: false; error: string };

// Everything a question type knows about its own data. Pure functions only.
export type QuestionTypeDef<C, A, R> = {
  // Checks untrusted content and answer (from the editor or the database) and returns clean copies.
  parse(content: unknown, answer: unknown): Parsed<C, A>;
  // Turns an untrusted candidate response into a typed one; null means "not answered".
  parseResponse(raw: unknown, content: C): R | null;
  check(content: C, answer: A, response: R): boolean;
  // Every picture the content uses (not the question picture, which is shared).
  mediaIds(content: C): string[];
};

export type AnyQuestionTypeDef = {
  parse(content: unknown, answer: unknown): Parsed<unknown, unknown>;
  parseResponse(raw: unknown, content: unknown): unknown;
  check(content: unknown, answer: unknown, response: unknown): boolean;
  mediaIds(content: unknown): string[];
};

// Erases the type parameters so every type fits in one registry.
export function defineQuestionType<C, A, R>(def: QuestionTypeDef<C, A, R>): AnyQuestionTypeDef {
  return def as unknown as AnyQuestionTypeDef;
}

type RegistryEntry = { label: string; def: AnyQuestionTypeDef | null };

// Each type step (C1–C4) fills in its `def`. A type with no def is not offered anywhere yet.
export const QUESTION_TYPES: Record<QuestionType, RegistryEntry> = {
  single_text: { label: "Single answer", def: null },
  single_picture: { label: "Single answer, pictures", def: null },
  multi_pick: { label: "Multiple answers", def: null },
  hotspot: { label: "Tap the area", def: null },
};

export function questionTypeLabel(type: QuestionType): string {
  return QUESTION_TYPES[type].label;
}

export function getQuestionTypeDef(type: QuestionType): AnyQuestionTypeDef | null {
  return QUESTION_TYPES[type].def;
}

export function availableQuestionTypes(): QuestionType[] {
  return (Object.keys(QUESTION_TYPES) as QuestionType[]).filter((type) => QUESTION_TYPES[type].def !== null);
}

export function checkWith(def: AnyQuestionTypeDef, content: unknown, answer: unknown, raw: unknown): CheckResult {
  const response = def.parseResponse(raw, content);
  if (response === null || response === undefined) return { answered: false, correct: false };
  return { answered: true, correct: def.check(content, answer, response) };
}
