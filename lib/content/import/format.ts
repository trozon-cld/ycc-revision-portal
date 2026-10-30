// The bulk upload batch (content.json): its shape, read from untrusted JSON. Pure, safe in the browser and on the server.

import { isRecord } from "@/lib/text";
import { MAX_BATCH_PICTURES } from "./limits";

export const BATCH_FORMAT = "ycc-content";
export const BATCH_VERSION = 1;
// A–Z, digits and dashes, starting with a letter or digit (e.g. AD-p012); same rule as the database.
export const SOURCE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/;
const LETTERS = "ABCDEF";

export type PictureSize = "small" | "medium" | "large" | "full";
export type PictureAlign = "left" | "center" | "right";

// Blocks as the page editor stores them, with a picture file name instead of a media id.
export type BatchBlock = Record<string, unknown> & { type: string; picture?: string };

export type BatchPage = { kind: "page"; key: string; sourcePage: number | null; title: string; blocks: BatchBlock[] };

export type BatchQuestionType = "single_text" | "single_picture" | "multi_pick" | "match_pictures" | "hotspot" | "area_choice";
export type BatchQuestion = {
  kind: "question";
  key: string;
  sourcePage: number | null;
  type: BatchQuestionType;
  stem: string;
  picture: { file: string; size: PictureSize | null; align: PictureAlign | null } | null;
  // Text for single_text / multi_pick; picture + label for single_picture; picture + box text for match_pictures.
  options: { text: string; picture: string | null }[];
  // Option positions (0 = A) that are right; match_pictures has none (each picture belongs to its own box).
  right: number[];
  pick: number | null;
  keepOrder: boolean;
  explanation: string | null;
  inPractice: boolean;
  inMock: boolean;
  // Tap the area / Choose the area: the answer shown after Check (e.g. "Gloves", "470 mm"). Their `picture` is the
  // one candidates tap; the areas are drawn by hand in the portal.
  label: string | null;
};

export type BatchItem = BatchPage | BatchQuestion;
export type BatchChapter = { chapter: string; items: BatchItem[] };
export type BatchPicture = { file: string; description: string };
export type Batch = { name: string; source: string; chapters: BatchChapter[]; pictures: BatchPicture[]; skipped: { sourcePage: number | null; reason: string }[] };

// What the browser found in the zip's pictures folder (it opens the zip; the check never sees the files themselves).
export type PictureFileInfo = { name: string; sha256: string | null; bytes: number; error: string | null };

// One problem found while reading; `key` points at the item when there is one.
export type BatchIssue = { key: string | null; sourcePage: number | null; message: string };
export type ReadResult = { ok: true; batch: Batch } | { ok: false; issues: BatchIssue[] };

const QUESTION_TYPES: readonly string[] = ["single_text", "single_picture", "multi_pick", "match_pictures", "hotspot", "area_choice"];
const AREA_TYPES: readonly string[] = ["hotspot", "area_choice"];
const str = (value: unknown) => (typeof value === "string" ? value : "");
const page = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null);

// "AD-p012" → "A–D PDF p12"; "E-p048" → "E PDF p48"; any other key is shown as it is.
export function sourceLabel(key: string): string {
  const match = /^(AD|E)-p0*(\d+)$/i.exec(key);
  if (!match) return key;
  return `${match[1].toUpperCase() === "AD" ? "A–D" : "E"} PDF p${match[2]}`;
}

// A search for a source page ("p12", "AD p12", "AD-p012", "e-p48") as a pattern for source keys; null for other searches.
export function sourceSearchPattern(search: string): string | null {
  const match = /^(?:(ad|e)\s*-?\s*)?p\.?\s*0*(\d{1,4})$/i.exec(search.trim());
  if (!match) return null;
  return `^${match[1] ? match[1].toUpperCase() : "(AD|E)"}-p0*${match[2]}$`;
}

// Checks the shape only (fields present, types right, answers as letters). The portal's own rules run on the server.
export function readBatch(raw: unknown): ReadResult {
  const issues: BatchIssue[] = [];
  const fail = (message: string) => ({ ok: false as const, issues: [{ key: null, sourcePage: null, message }] });
  if (!isRecord(raw)) return fail("content.json isn't a batch file.");
  if (raw.format !== BATCH_FORMAT) return fail(`content.json isn't a batch file (format should be "${BATCH_FORMAT}").`);
  if (raw.version !== BATCH_VERSION) return fail(`This batch is version ${String(raw.version)}; this portal reads version ${BATCH_VERSION}.`);
  if (!Array.isArray(raw.chapters) || raw.chapters.length === 0) return fail("The batch has no chapters.");

  const chapters: BatchChapter[] = [];
  for (const [index, rawChapter] of raw.chapters.entries()) {
    const name = isRecord(rawChapter) ? str(rawChapter.chapter).trim() : "";
    if (!name) {
      issues.push({ key: null, sourcePage: null, message: `Chapter ${index + 1} has no name.` });
      continue;
    }
    const items: BatchItem[] = [];
    const rawItems = isRecord(rawChapter) && Array.isArray(rawChapter.items) ? rawChapter.items : [];
    if (rawItems.length === 0) issues.push({ key: null, sourcePage: null, message: `Chapter "${name}" has no items.` });
    for (const rawItem of rawItems) {
      const item = readItem(rawItem, issues);
      if (item) items.push(item);
    }
    chapters.push({ chapter: name, items });
  }

  const pictures: BatchPicture[] = [];
  for (const rawPicture of Array.isArray(raw.pictures) ? raw.pictures : []) {
    const file = isRecord(rawPicture) ? str(rawPicture.file).trim() : "";
    if (!file) {
      issues.push({ key: null, sourcePage: null, message: "A picture in the pictures list has no file name." });
      continue;
    }
    pictures.push({ file, description: isRecord(rawPicture) ? str(rawPicture.description) : "" });
  }

  const skipped = (Array.isArray(raw.skipped) ? raw.skipped : []).filter(isRecord).map((entry) => ({ sourcePage: page(entry.sourcePage), reason: str(entry.reason) }));
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, batch: { name: str(raw.batch), source: str(raw.source), chapters, pictures, skipped } };
}

function readItem(raw: unknown, issues: BatchIssue[]): BatchItem | null {
  if (!isRecord(raw)) {
    issues.push({ key: null, sourcePage: null, message: "An item isn't a page or a question." });
    return null;
  }
  const key = str(raw.key).trim();
  const sourcePage = page(raw.sourcePage);
  const issue = (message: string) => {
    issues.push({ key: key || null, sourcePage, message });
    return null;
  };
  if (!SOURCE_KEY_PATTERN.test(key)) return issue(key ? `The key "${key}" isn't valid: letters, digits and dashes only, up to 40.` : "An item has no key.");

  if (raw.kind === "page") {
    if (!Array.isArray(raw.blocks)) return issue("This page has no blocks.");
    const blocks = raw.blocks.filter(isRecord) as BatchBlock[];
    if (blocks.length !== raw.blocks.length) return issue("A block on this page isn't valid.");
    return { kind: "page", key, sourcePage, title: str(raw.title), blocks };
  }
  if (raw.kind !== "question") return issue(`"${str(raw.kind)}" isn't a page or a question.`);

  const type = str(raw.type);
  if (!QUESTION_TYPES.includes(type)) return issue(`"${type}" isn't a question type.`);
  if (AREA_TYPES.includes(type)) return readAreaQuestion(raw, key, sourcePage, type as BatchQuestionType, issue);
  if (!Array.isArray(raw.options)) return issue("This question has no options.");

  const options: BatchQuestion["options"] = [];
  for (const option of raw.options) {
    if (typeof option === "string") options.push({ text: option, picture: null });
    else if (isRecord(option)) options.push({ text: str(option.label ?? option.text), picture: str(option.picture) || null });
    else return issue("An option isn't valid.");
  }
  const right: number[] = [];
  if (type !== "match_pictures") {
    for (const letter of str(raw.answer).split(",").map((part) => part.trim()).filter(Boolean)) {
      const position = LETTERS.indexOf(letter.toUpperCase());
      if (letter.length !== 1 || position < 0 || position >= options.length) return issue(`The answer "${str(raw.answer)}" doesn't match the options (A–${LETTERS[Math.max(0, options.length - 1)]}).`);
      if (!right.includes(position)) right.push(position);
    }
    if (right.length === 0) return issue("This question has no answer.");
  }

  let picture: BatchQuestion["picture"] = null;
  if (raw.picture !== undefined && raw.picture !== null && raw.picture !== "") {
    const file = typeof raw.picture === "string" ? raw.picture : isRecord(raw.picture) ? str(raw.picture.file) : "";
    if (!file) return issue("The question picture isn't valid.");
    const extra = isRecord(raw.picture) ? raw.picture : {};
    picture = { file, size: (str(extra.size) || null) as PictureSize | null, align: (str(extra.align) || null) as PictureAlign | null };
  }
  const pick = typeof raw.pick === "number" ? raw.pick : null;
  return {
    kind: "question",
    key,
    sourcePage,
    type: type as BatchQuestionType,
    stem: str(raw.stem),
    picture,
    options,
    right: right.sort((a, b) => a - b),
    pick: type === "multi_pick" ? (pick ?? right.length) : null,
    keepOrder: raw.keepOrder === true,
    explanation: str(raw.explanation) || null,
    inPractice: raw.inPractice !== false,
    inMock: raw.inMock !== false,
    label: null,
  };
}

// Tap the area / Choose the area: the picture to tap, the question and the answer label; no options or letters.
function readAreaQuestion(raw: Record<string, unknown>, key: string, sourcePage: number | null, type: BatchQuestionType, issue: (message: string) => null): BatchQuestion | null {
  const file = typeof raw.picture === "string" ? raw.picture : isRecord(raw.picture) ? str(raw.picture.file) : "";
  if (!file) return issue("This question needs the picture candidates tap.");
  if ((Array.isArray(raw.options) && raw.options.length > 0) || str(raw.answer)) {
    return issue("The areas of this question are drawn in the portal, so it has no options or answer letters. Put the answer in label.");
  }
  return {
    kind: "question",
    key,
    sourcePage,
    type,
    stem: str(raw.stem),
    picture: { file, size: null, align: null },
    options: [],
    right: [],
    pick: null,
    keepOrder: false,
    explanation: str(raw.explanation) || null,
    inPractice: raw.inPractice !== false,
    inMock: raw.inMock !== false,
    label: str(raw.label) || null,
  };
}

// Every picture file an item uses.
export function picturesOf(item: BatchItem): string[] {
  if (item.kind === "page") return item.blocks.filter((block) => block.type === "picture" && typeof block.picture === "string").map((block) => block.picture as string);
  return [...(item.picture ? [item.picture.file] : []), ...item.options.flatMap((option) => (option.picture ? [option.picture] : []))];
}

// The browser's findings about each picture file (untrusted), kept to what the check uses; null if malformed.
export function readPictureList(value: unknown): PictureFileInfo[] | null {
  if (!Array.isArray(value) || value.length > MAX_BATCH_PICTURES * 2) return null;
  const files: PictureFileInfo[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.name !== "string" || !raw.name || raw.name.length > 255) return null;
    const sha256 = typeof raw.sha256 === "string" && /^[0-9a-f]{64}$/.test(raw.sha256) ? raw.sha256 : null;
    const bytes = typeof raw.bytes === "number" && raw.bytes >= 0 ? raw.bytes : 0;
    const error = typeof raw.error === "string" && raw.error ? raw.error.slice(0, 200) : null;
    files.push({ name: raw.name, sha256, bytes, error });
  }
  return files;
}
