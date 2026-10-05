import type { PoolClient } from "pg";
import { TITLE_MAX_LENGTH } from "@/lib/limits";
import { cleanLine } from "@/lib/text";
import type { FormState } from "@/lib/forms";

export type StructureActionState = FormState;

export const MAX_SECTIONS = 26;

// Serialises every change to the items' order within chapters; reads are not blocked.
export async function lockHandbookOrder(client: PoolClient) {
  await client.query(`lock table handbook_items in share row exclusive mode`);
}

// Serialises every change to section/chapter order; reads are not blocked.
export async function lockHandbookStructure(client: PoolClient) {
  await client.query(`lock table sections, chapters in share row exclusive mode`);
}

export function normaliseTitle(value: FormDataEntryValue | string | null | undefined): string {
  return cleanLine(value);
}

export function validateTitle(title: string, noun: "Section" | "Chapter"): string | null {
  if (!title) return `${noun} title is required.`;
  if (title.length > TITLE_MAX_LENGTH) return `${noun} title must be ${TITLE_MAX_LENGTH} characters or fewer.`;
  return null;
}

export function sectionLetter(position: number): string {
  return String.fromCharCode(64 + position);
}

export function chapterNumber(number: number): string {
  return String(number).padStart(2, "0");
}
