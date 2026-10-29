import type { PoolClient } from "pg";
import { AREA_TYPES } from "@/lib/questions/areas";
import { parseQuestion } from "@/lib/questions/validate";
import { parseBlocks, type Block } from "@/lib/content/blocks";
import { validateTitle, normaliseTitle } from "@/lib/handbook/structure";
import { ALT_TEXT_MAX_LENGTH } from "@/lib/limits";
import { isRecord } from "@/lib/text";
import { readBatch, picturesOf, type Batch, type BatchIssue, type BatchItem, type PictureFileInfo } from "./format";
import { toBlocksInput, toQuestionInput, type ItemIds } from "./convert";
import { MAX_BATCH_ITEMS, MAX_BATCH_PICTURES, MAX_REPORTED_ISSUES } from "./limits";

// Checks a batch against the portal and the database without saving anything (run 3); the import reuses it.

type Db = Pick<PoolClient, "query">;

export type Change = "new" | "update" | "same";
export type ChangeCounts = Record<Change, number>;
export type CheckReport = {
  ok: boolean;
  batchName: string;
  chapters: { name: string; found: boolean; items: number; notInBatch: number }[];
  pages: ChangeCounts;
  questions: ChangeCounts;
  pictures: ChangeCounts;
  // Each picture the items use, by its file name in the batch, and what importing would do with it.
  pictureChanges: { file: string; change: Change }[];
  // Published pages and questions the import would change (they stay published, so the change shows at once).
  publishedChanges: number;
  errors: BatchIssue[];
  notes: BatchIssue[];
  skipped: Batch["skipped"];
  // Errors and notes beyond MAX_REPORTED_ISSUES are counted, not listed.
  moreErrors: number;
  moreNotes: number;
};

const zero = (): ChangeCounts => ({ new: 0, update: 0, same: 0 });
// Stand-in ids for checking and comparing: the same position always gets the same id.
const fakeId = (group: number, position: number) => `00000000-0000-4000-8000-${(group * 100000 + position).toString(16).padStart(12, "0")}`;

export async function checkBatch(db: Db, raw: unknown, files: PictureFileInfo[]): Promise<CheckReport> {
  const report: CheckReport = {
    ok: false, batchName: "", chapters: [], pages: zero(), questions: zero(), pictures: zero(), pictureChanges: [], publishedChanges: 0, errors: [], notes: [], skipped: [], moreErrors: 0, moreNotes: 0,
  };
  const error = (issue: BatchIssue) => (report.errors.length < MAX_REPORTED_ISSUES ? report.errors.push(issue) : report.moreErrors++);
  const note = (issue: BatchIssue) => (report.notes.length < MAX_REPORTED_ISSUES ? report.notes.push(issue) : report.moreNotes++);
  const general = (message: string) => ({ key: null, sourcePage: null, message });

  const read = readBatch(raw);
  if (!read.ok) {
    read.issues.forEach(error);
    return report;
  }
  const batch = read.batch;
  report.batchName = batch.name;
  report.skipped = batch.skipped;
  const items = batch.chapters.flatMap((chapter) => chapter.items.map((item) => ({ item, chapter: chapter.chapter })));
  if (items.length > MAX_BATCH_ITEMS) {
    error(general(`A batch can have up to ${MAX_BATCH_ITEMS} items; this one has ${items.length}. Split it into smaller batches.`));
    return report;
  }
  if (batch.pictures.length > MAX_BATCH_PICTURES) {
    error(general(`A batch can have up to ${MAX_BATCH_PICTURES} pictures; this one has ${batch.pictures.length}. Split it into smaller batches.`));
    return report;
  }

  // Keys: one item each, across the whole batch.
  const seen = new Map<string, BatchItem>();
  for (const { item } of items) {
    const lower = item.key.toLowerCase();
    if (seen.has(lower)) error({ key: item.key, sourcePage: item.sourcePage, message: `The key ${item.key} is used more than once in this batch.` });
    else seen.set(lower, item);
  }

  // Pictures: listed once with a description, present in the zip and readable.
  const listed = new Map<string, string>();
  for (const picture of batch.pictures) {
    const lower = picture.file.toLowerCase();
    if (listed.has(lower)) error(general(`The picture ${picture.file} is listed more than once.`));
    listed.set(lower, picture.description.trim());
    if (!picture.description.trim()) error(general(`The picture ${picture.file} needs a description (it's read aloud to people who can't see it).`));
    else if (picture.description.trim().length > ALT_TEXT_MAX_LENGTH) error(general(`The description of ${picture.file} must be ${ALT_TEXT_MAX_LENGTH} characters or fewer.`));
  }
  const fileByName = new Map(files.map((file) => [file.name.toLowerCase(), file]));
  const used = new Set<string>();
  for (const { item } of items) {
    for (const file of picturesOf(item)) {
      const lower = file.toLowerCase();
      used.add(lower);
      if (!listed.has(lower)) error({ key: item.key, sourcePage: item.sourcePage, message: `The picture ${file} isn't in the batch's pictures list.` });
      const found = fileByName.get(lower);
      if (!found) error({ key: item.key, sourcePage: item.sourcePage, message: `The picture ${file} isn't in the zip's pictures folder.` });
      else if (found.error) error({ key: item.key, sourcePage: item.sourcePage, message: `${file}: ${found.error}` });
    }
  }
  for (const [lower] of listed) if (!used.has(lower)) note(general(`The picture ${batch.pictures.find((p) => p.file.toLowerCase() === lower)?.file} is listed but not used by any item; it won't be uploaded.`));
  for (const file of files) if (!listed.has(file.name.toLowerCase())) note(general(`${file.name} is in the pictures folder but not in the pictures list; it won't be uploaded.`));

  // Chapters, by their exact name in the portal.
  const { rows: chapterRows } = await db.query<{ id: string; title: string }>(`select id, title from chapters`);
  const chapterByName = new Map(chapterRows.map((row) => [row.title.toLowerCase(), row]));
  const chapterIdOf = new Map<string, string>();
  for (const chapter of batch.chapters) {
    const found = chapterByName.get(chapter.chapter.toLowerCase());
    if (!found) error(general(`The chapter "${chapter.chapter}" doesn't exist in the portal. Check its name on the Handbook page.`));
    else if (found.title !== chapter.chapter) error(general(`The chapter "${chapter.chapter}" is called "${found.title}" in the portal. Use the exact name.`));
    else chapterIdOf.set(chapter.chapter, found.id);
  }

  // What the portal already has under these keys and picture names.
  const keys = items.map(({ item }) => item.key);
  const existingQuestions = await db.query<QuestionRow>(
    `select q.id, q.source_key, q.chapter_id, q.type, q.stem_text, q.stem_media_id, q.stem_media_size, q.stem_media_align, q.content, q.answer,
            q.explanation, q.in_practice, q.in_mock, q.status
     from questions q
     where q.source_key = any($1::varchar[])`,
    [keys]
  );
  const existingPages = await db.query<PageRow>(`select id, source_key, chapter_id, title, blocks, status from content_pages where source_key = any($1::varchar[])`, [keys]);
  const existingMedia = await db.query<{ id: string; name: string | null; sha256: string | null }>(
    `select id, lower(source_name) as name, source_sha256 as sha256 from media where lower(source_name) = any($1::varchar[])`,
    [[...used]]
  );
  const questionByKey = new Map(existingQuestions.rows.map((row) => [row.source_key, row]));
  const pageByKey = new Map(existingPages.rows.map((row) => [row.source_key, row]));

  // Media names for comparing: batch pictures by file name; stored ones by their batch name (hand-made ones never match).
  const storedMediaIds = new Set<string>();
  for (const row of existingQuestions.rows) {
    if (row.stem_media_id) storedMediaIds.add(row.stem_media_id);
    collectIds(row.content).forEach((id) => storedMediaIds.add(id));
  }
  for (const row of existingPages.rows) collectIds(row.blocks).forEach((id) => storedMediaIds.add(id));
  const { rows: storedNames } = storedMediaIds.size
    ? await db.query<{ id: string; name: string | null }>(`select id, lower(source_name) as name from media where id = any($1::uuid[])`, [[...storedMediaIds]])
    : { rows: [] };
  const nameOfStored = new Map(storedNames.map((row) => [row.id, row.name ?? `id:${row.id}`]));
  const mediaIdOfName = new Map([...used].map((name, position) => [name, fakeId(9, position)]));
  const nameOfFake = new Map([...mediaIdOfName].map(([name, id]) => [id, name]));
  const ids: ItemIds = { option: (i) => fakeId(1, i), matchItem: (i) => fakeId(2, i), block: (i) => fakeId(3, i), media: (file) => mediaIdOfName.get(file.toLowerCase()) ?? fakeId(9, 99999) };

  let unmarkedNew = 0;
  const keptByHand: string[] = [];
  for (const { item, chapter } of items) {
    const chapterId = chapterIdOf.get(chapter);
    const at = { key: item.key, sourcePage: item.sourcePage };
    if (item.kind === "page") {
      const title = normaliseTitle(item.title);
      const titleError = validateTitle(title, "Page");
      const parsed = parseBlocks(toBlocksInput(item, ids));
      if (titleError) error({ ...at, message: titleError });
      if (!parsed.ok) error({ ...at, message: parsed.error });
      if (questionByKey.has(item.key)) error({ ...at, message: `The key ${item.key} belongs to a question in the portal, not a page.` });
      const existing = pageByKey.get(item.key);
      if (!existing) report.pages.new++;
      else if (chapterId && existing.chapter_id !== chapterId) error({ ...at, message: "This page is in another chapter in the portal. Moving between chapters isn't done by upload." });
      else if (parsed.ok) {
        const same = existing.title === title && sameJson(pageShape(parsed.blocks, (id) => nameOfFake.get(id)), pageShape(storedBlocks(existing.blocks), (id) => nameOfStored.get(id)));
        report.pages[same ? "same" : "update"]++;
        if (!same && existing.status === "published") report.publishedChanges++;
      }
      continue;
    }
    const parsed = parseQuestion(toQuestionInput(item, ids), { allowUnmarked: true });
    if (!parsed.ok) error({ ...at, message: parsed.error });
    if (pageByKey.has(item.key)) error({ ...at, message: `The key ${item.key} belongs to a page in the portal, not a question.` });
    const existing = questionByKey.get(item.key);
    const byHand = AREA_TYPES.includes(item.type);
    if (!existing) {
      report.questions.new++;
      if (byHand) unmarkedNew++;
    } else if (existing.type !== item.type) error({ ...at, message: "This question has a different type in the portal. A question's type can't be changed by upload." });
    else if (chapterId && existing.chapter_id !== chapterId) error({ ...at, message: "This question is in another chapter in the portal. Moving between chapters isn't done by upload." });
    else if (byHand) {
      // Their areas are drawn in the portal, so an upload never changes one that's already there.
      report.questions.same++;
      keptByHand.push(item.key);
    } else if (parsed.ok) {
      const batchShape = questionShape(parsed.question, (id) => nameOfFake.get(id), item.inPractice, item.inMock);
      const storedShape = questionShape(storedQuestion(existing), (id) => nameOfStored.get(id), existing.in_practice, existing.in_mock);
      const same = sameJson(batchShape, storedShape);
      report.questions[same ? "same" : "update"]++;
      if (!same && existing.status === "published") report.publishedChanges++;
    }
  }

  if (unmarkedNew > 0) {
    const one = unmarkedNew === 1;
    note(general(`${one ? "1 Tap the area or Choose the area question comes" : `${unmarkedNew} Tap the area and Choose the area questions come`} in without ${one ? "its" : "their"} areas. Find ${one ? "it" : "them"} in the Question bank under Status: Needs areas, and mark the areas before publishing.`));
  }
  if (keptByHand.length > 0) {
    note(general(`${keptByHand.length === 1 ? "1 Tap the area or Choose the area question is" : `${keptByHand.length} Tap the area and Choose the area questions are`} already in the portal and ${keptByHand.length === 1 ? "is" : "are"} left as ${keptByHand.length === 1 ? "it is" : "they are"}, so ${keptByHand.length === 1 ? "its" : "their"} drawn areas stay (${keptByHand.slice(0, 5).join(", ")}${keptByHand.length > 5 ? ", …" : ""}). Edit ${keptByHand.length === 1 ? "it" : "them"} in the portal.`));
  }

  // Pictures: new, replaced (same name, different file) or the same file again.
  const storedByName = new Map(existingMedia.rows.map((row) => [row.name, row]));
  for (const name of used) {
    const stored = storedByName.get(name);
    const sha = fileByName.get(name)?.sha256 ?? null;
    const file = batch.pictures.find((picture) => picture.file.toLowerCase() === name)?.file ?? name;
    const change: Change = !stored ? "new" : stored.sha256 && sha && stored.sha256 === sha ? "same" : "update";
    report.pictures[change]++;
    report.pictureChanges.push({ file, change });
    if (change === "update") {
      note(general(`The picture ${file} is already in the portal and would be replaced by the new file wherever it's used.`));
    }
  }

  // Each chapter: what's in the portal's Handbook that this batch doesn't mention.
  const chapterIds = [...chapterIdOf.values()];
  const { rows: others } = chapterIds.length
    ? await db.query<{ chapter_id: string; count: number }>(
        `select hi.chapter_id, count(*)::int as count
         from handbook_items hi left join content_pages p on p.id = hi.content_page_id left join questions q on q.id = hi.question_id
         where hi.chapter_id = any($1::uuid[]) and coalesce(p.source_key, q.source_key, '') <> all($2::varchar[])
         group by hi.chapter_id`,
        [chapterIds, keys]
      )
    : { rows: [] };
  const otherCount = new Map(others.map((row) => [row.chapter_id, row.count]));
  report.chapters = batch.chapters.map((chapter) => {
    const id = chapterIdOf.get(chapter.chapter);
    const notInBatch = id ? (otherCount.get(id) ?? 0) : 0;
    if (notInBatch > 0) note(general(`${notInBatch} item${notInBatch === 1 ? "" : "s"} in "${chapter.chapter}" ${notInBatch === 1 ? "isn't" : "aren't"} in this batch; ${notInBatch === 1 ? "it stays" : "they stay"} where ${notInBatch === 1 ? "it is" : "they are"}.`));
    return { name: chapter.chapter, found: Boolean(id), items: chapter.items.length, notInBatch };
  });
  report.ok = report.errors.length === 0 && report.moreErrors === 0;
  return report;
}

type QuestionRow = {
  id: string; source_key: string; chapter_id: string; type: string; stem_text: string; stem_media_id: string | null; stem_media_size: string | null;
  stem_media_align: string | null; content: unknown; answer: unknown; explanation: string | null; in_practice: boolean; in_mock: boolean; status: string;
};
type PageRow = { id: string; source_key: string; chapter_id: string; title: string; blocks: unknown; status: string };
type Shaped = { type: string; stemText: string; stemMediaId: string | null; stemMediaSize: string | null; stemMediaAlign: string | null; content: unknown; answer: unknown; explanation: string | null };

const storedQuestion = (row: QuestionRow): Shaped => ({
  type: row.type, stemText: row.stem_text, stemMediaId: row.stem_media_id, stemMediaSize: row.stem_media_size, stemMediaAlign: row.stem_media_align,
  content: row.content, answer: row.answer, explanation: row.explanation,
});
const storedBlocks = (value: unknown): Block[] => (Array.isArray(value) ? (value as Block[]) : []);

// The question as plain facts: texts in order, which positions are right, picture names. Ids don't matter.
function questionShape(q: Shaped, name: (id: string) => string | undefined, inPractice: boolean, inMock: boolean) {
  const content = isRecord(q.content) ? q.content : {};
  const answer = isRecord(q.answer) ? q.answer : {};
  const options = Array.isArray(content.options) ? content.options.filter(isRecord) : [];
  const position = (id: unknown) => options.findIndex((option) => option.id === id);
  let facts: unknown;
  if (q.type === "match_pictures") {
    const targets = Array.isArray(content.targets) ? content.targets.filter(isRecord) : [];
    const items = new Map((Array.isArray(content.items) ? content.items.filter(isRecord) : []).map((item) => [item.id, item.mediaId]));
    const matches = Array.isArray(answer.matches) ? answer.matches.filter(isRecord) : [];
    facts = targets.map((target) => ({ label: target.label, picture: name(String(items.get(matches.find((m) => m.targetId === target.id)?.itemId) ?? "")) }));
  } else {
    facts = {
      options: options.map((option) => (q.type === "single_picture" ? { picture: name(String(option.mediaId)), label: option.label } : option.text)),
      right: "correctOptionIds" in answer && Array.isArray(answer.correctOptionIds) ? answer.correctOptionIds.map(position).sort() : [position(answer.correctOptionId)],
      pick: content.pick ?? null,
      keepOrder: content.keepOrder === true,
    };
  }
  return {
    stem: q.stemText, picture: q.stemMediaId ? name(q.stemMediaId) : null, size: q.stemMediaSize, align: q.stemMediaAlign,
    facts, explanation: q.explanation, inPractice, inMock,
  };
}

function pageShape(blocks: Block[], name: (id: string) => string | undefined) {
  return blocks.map((block) => {
    const rest: Record<string, unknown> = { ...block, id: undefined };
    return block.type === "picture" ? { ...rest, mediaId: name(block.mediaId) } : rest;
  });
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => [k, sorted(value[k])]));
  return value;
}

// Every media id inside stored question content or page blocks.
function collectIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectIds);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, inner]) => (key === "mediaId" && typeof inner === "string" && inner ? [inner] : collectIds(inner)));
}
