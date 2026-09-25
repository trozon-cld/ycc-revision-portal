import type { PoolClient } from "pg";

export type StructureActionState = { error?: string; success?: boolean };

export const MAX_TITLE_LENGTH = 120;
export const MAX_SECTIONS = 26;

// Serialises every change to section/chapter order; reads are not blocked.
export async function lockHandbookStructure(client: PoolClient) {
  await client.query(`lock table sections, chapters in share row exclusive mode`);
}

export function normaliseTitle(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function validateTitle(title: string, noun: "Section" | "Chapter"): string | null {
  if (!title) return `${noun} title is required.`;
  if (title.length > MAX_TITLE_LENGTH) return `${noun} title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  return null;
}

export function sectionLetter(position: number): string {
  return String.fromCharCode(64 + position);
}

export function chapterNumber(number: number): string {
  return String(number).padStart(2, "0");
}
