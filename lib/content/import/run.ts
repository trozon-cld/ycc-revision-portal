import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { SessionPayload } from "@/lib/auth/jwt";
import { logActivity } from "@/lib/audit/log";
import { withTransaction } from "@/lib/db/transaction";
import { lockHandbookOrder, normaliseTitle } from "@/lib/handbook/structure";
import { parseBlocks } from "@/lib/content/blocks";
import { AREA_TYPES } from "@/lib/questions/areas";
import { parseQuestion, questionFingerprint } from "@/lib/questions/validate";
import { isRecord } from "@/lib/text";
import { checkBatch, type CheckReport } from "./check";
import { toBlocksInput, toQuestionInput, type ItemIds } from "./convert";
import { picturesOf, readBatch, type BatchPage, type BatchQuestion, type PictureFileInfo } from "./format";

// Server-only: saves a checked batch (POST /api/content/import) in one transaction. New items are drafts; changed
// items keep their ids and status (a version goes up only when what candidates see changed); nothing is deleted.

export type ImportCounts = { created: number; updated: number; unchanged: number };
export type ImportResult =
  | { ok: true; pages: ImportCounts; questions: ImportCounts; chapters: { id: string; name: string }[] }
  | { ok: false; error: string; report?: CheckReport };

type StoredQuestion = {
  id: string; source_key: string; content_version: number; stem_text: string; stem_media_id: string | null; stem_media_size: string | null;
  stem_media_align: string | null; content: unknown; answer: unknown; explanation: string | null; in_practice: boolean; in_mock: boolean; type: string;
};
type StoredPage = { id: string; source_key: string; title: string; blocks: unknown };

export async function importBatch(session: SessionPayload, raw: unknown, files: PictureFileInfo[]): Promise<ImportResult> {
  return withTransaction<ImportResult>(async (client) => {
    // One import at a time, and no Handbook reordering meanwhile.
    await client.query(`select pg_advisory_xact_lock(hashtext('content:import'))`);
    await lockHandbookOrder(client);
    const report = await checkBatch(client, raw, files);
    if (!report.ok) return { ok: false, error: "The batch has problems to fix. Check it again for the details.", report };
    const read = readBatch(raw);
    if (!read.ok) return { ok: false, error: "The batch couldn't be read.", report };
    const batch = read.batch;

    // Every picture must already be uploaded, with the same file.
    const shaOf = new Map(files.map((file) => [file.name.toLowerCase(), file.sha256]));
    const used = [...new Set(batch.chapters.flatMap((chapter) => chapter.items.flatMap(picturesOf)).map((name) => name.toLowerCase()))];
    const { rows: media } = await client.query<{ id: string; name: string; sha256: string | null }>(
      `select id, lower(source_name) as name, source_sha256 as sha256 from media where lower(source_name) = any($1::varchar[]) for share`,
      [used]
    );
    const mediaByName = new Map(media.map((row) => [row.name, row]));
    for (const name of used) {
      const row = mediaByName.get(name);
      if (!row || row.sha256 !== shaOf.get(name)) return { ok: false, error: `The picture ${name} hasn't been uploaded yet. Import again.` };
    }
    const mediaId = (file: string) => mediaByName.get(file.toLowerCase())!.id;

    const pages: ImportCounts = { created: 0, updated: 0, unchanged: 0 };
    const questions: ImportCounts = { created: 0, updated: 0, unchanged: 0 };
    const chapters: { id: string; name: string }[] = [];
    let moved = 0;
    for (const chapter of batch.chapters) {
      const { rows: found } = await client.query<{ id: string }>(`select id from chapters where title = $1 for share`, [chapter.chapter]);
      const chapterId = found[0].id;
      chapters.push({ id: chapterId, name: chapter.chapter });
      const placed: Placed[] = [];
      for (const item of chapter.items) {
        placed.push(
          item.kind === "page" ? await savePage(client, chapterId, item, mediaId, pages) : await saveQuestion(client, chapterId, item, mediaId, questions)
        );
      }
      moved += await setOrder(client, chapterId, placed);
    }

    // Nothing created, changed or moved: nothing to log.
    if (pages.created + pages.updated + questions.created + questions.updated + moved === 0) return { ok: true, pages, questions, chapters };
    const summary = (label: string, counts: ImportCounts) => `${label}: ${counts.created} new, ${counts.updated} updated, ${counts.unchanged} unchanged`;
    await logActivity(
      client,
      session,
      "content.imported",
      { type: "batch", id: null, label: batch.name || "Batch" },
      { chapters: chapters.map((chapter) => chapter.name).join(", "), items: `${summary("Pages", pages)} · ${summary("Questions", questions)}` }
    );
    return { ok: true, pages, questions, chapters };
  });
}

// Creates or updates one page; returns its Handbook item id.
async function savePage(client: PoolClient, chapterId: string, item: BatchPage, mediaId: (file: string) => string, counts: ImportCounts): Promise<Placed> {
  const { rows } = await client.query<StoredPage>(`select id, source_key, title, blocks from content_pages where source_key = $1 for update`, [item.key]);
  const stored = rows[0];
  const storedBlocks = stored && Array.isArray(stored.blocks) ? (stored.blocks as { id?: unknown }[]) : [];
  const ids = itemIds(mediaId, { block: (i) => (typeof storedBlocks[i]?.id === "string" ? (storedBlocks[i].id as string) : undefined) });
  const parsed = parseBlocks(toBlocksInput(item, ids));
  if (!parsed.ok) throw new Error(`Batch item ${item.key} failed after its check: ${parsed.error}`);
  const blocks = JSON.stringify(parsed.blocks);
  const title = normaliseTitle(item.title);
  const pictures = [...new Set(parsed.blocks.flatMap((block) => (block.type === "picture" ? [block.mediaId] : [])))];

  let pageId: string;
  if (!stored) {
    const { rows: created } = await client.query<{ id: string }>(
      `insert into content_pages (chapter_id, title, blocks, source_key) values ($1, $2, $3, $4) returning id`,
      [chapterId, title, blocks, item.key]
    );
    pageId = created[0].id;
    counts.created++;
  } else {
    pageId = stored.id;
    const { rows: changed } = await client.query<{ changed: boolean }>(
      `select (blocks <> $2::jsonb or title <> $3) as changed from content_pages where id = $1`,
      [pageId, blocks, title]
    );
    if (changed[0].changed) {
      // As the page editor saves: the version goes up only when the blocks change.
      await client.query(
        `update content_pages set title = $3, content_version = content_version + (case when blocks = $2::jsonb then 0 else 1 end), blocks = $2::jsonb, updated_at = now()
         where id = $1`,
        [pageId, blocks, title]
      );
      counts.updated++;
    } else counts.unchanged++;
  }
  await client.query(`delete from content_page_media where content_page_id = $1`, [pageId]);
  if (pictures.length > 0) {
    await client.query(`insert into content_page_media (content_page_id, media_id) select $1::uuid, unnest($2::uuid[])`, [pageId, pictures]);
  }
  return placeInBook(client, chapterId, { pageId });
}

// Creates or updates one question (in the Handbook, like every batch question); returns its Handbook item id.
async function saveQuestion(client: PoolClient, chapterId: string, item: BatchQuestion, mediaId: (file: string) => string, counts: ImportCounts): Promise<Placed> {
  const { rows } = await client.query<StoredQuestion>(
    `select id, source_key, content_version, type, stem_text, stem_media_id, stem_media_size, stem_media_align, content, answer, explanation, in_practice, in_mock
     from questions where source_key = $1 for update`,
    [item.key]
  );
  const stored = rows[0];
  // Tap the area / Choose the area already in the portal: left as they are, so their drawn areas stay.
  if (stored && AREA_TYPES.includes(stored.type)) {
    counts.unchanged++;
    return placeInBook(client, chapterId, { questionId: stored.id });
  }
  const ids = itemIds(mediaId, stored ? keptQuestionIds(stored) : {});
  const parsed = parseQuestion(toQuestionInput(item, ids), { allowUnmarked: true });
  if (!parsed.ok) throw new Error(`Batch item ${item.key} failed after its check: ${parsed.error}`);
  const q = parsed.question;

  let questionId: string;
  if (!stored) {
    const { rows: created } = await client.query<{ id: string }>(
      `insert into questions (chapter_id, type, stem_text, stem_media_id, content, answer, explanation, in_practice, in_mock, stem_media_size, stem_media_align, source_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [chapterId, q.type, q.stemText, q.stemMediaId, JSON.stringify(q.content), JSON.stringify(q.answer), q.explanation, item.inPractice, item.inMock, q.stemMediaSize, q.stemMediaAlign, item.key]
    );
    questionId = created[0].id;
    counts.created++;
  } else {
    questionId = stored.id;
    const before = parseQuestion({
      type: stored.type, stemText: stored.stem_text, stemMediaId: stored.stem_media_id, stemMediaSize: stored.stem_media_size,
      stemMediaAlign: stored.stem_media_align, content: stored.content, answer: stored.answer, explanation: stored.explanation,
    }, { allowUnmarked: true });
    const contentChanged = !before.ok || questionFingerprint(before.question) !== questionFingerprint(q);
    const usageChanged = stored.in_practice !== item.inPractice || stored.in_mock !== item.inMock;
    if (contentChanged || usageChanged) {
      await client.query(
        `update questions
         set stem_text = $2, stem_media_id = $3, content = $4, answer = $5, explanation = $6, in_practice = $7, in_mock = $8,
             content_version = $9, stem_media_size = $10, stem_media_align = $11, updated_at = now()
         where id = $1`,
        [questionId, q.stemText, q.stemMediaId, JSON.stringify(q.content), JSON.stringify(q.answer), q.explanation, item.inPractice, item.inMock,
         stored.content_version + (contentChanged ? 1 : 0), q.stemMediaSize, q.stemMediaAlign]
      );
      counts.updated++;
    } else counts.unchanged++;
  }
  await client.query(`delete from question_media where question_id = $1`, [questionId]);
  if (q.mediaIds.length > 0) {
    await client.query(`insert into question_media (question_id, media_id) select $1::uuid, unnest($2::uuid[])`, [questionId, q.mediaIds]);
  }
  return placeInBook(client, chapterId, { questionId });
}

type Placed = { id: string; isNew: boolean };

// The item's place in the chapter's book: kept if it has one, otherwise added at the end (the order is set afterwards).
async function placeInBook(client: PoolClient, chapterId: string, item: { pageId?: string; questionId?: string }): Promise<Placed> {
  const { rows } = await client.query<{ id: string }>(
    `select id from handbook_items where content_page_id = $1 or question_id = $2`,
    [item.pageId ?? null, item.questionId ?? null]
  );
  if (rows[0]) return { id: rows[0].id, isNew: false };
  const { rows: created } = await client.query<{ id: string }>(
    `insert into handbook_items (chapter_id, position, content_page_id, question_id)
     select $1, coalesce(max(position), 0) + 1, $2, $3 from handbook_items where chapter_id = $1
     returning id`,
    [chapterId, item.pageId ?? null, item.questionId ?? null]
  );
  return { id: created[0].id, isNew: true };
}

// Items already in the book keep their place. A new item goes right after the batch item before it (or before
// the next one already placed, or at the end), so a first import follows the batch and a partial one moves nothing.
async function setOrder(client: PoolClient, chapterId: string, batch: Placed[]): Promise<number> {
  const fresh = new Set(batch.filter((item) => item.isNew).map((item) => item.id));
  const { rows } = await client.query<{ id: string }>(`select id from handbook_items where chapter_id = $1 order by position`, [chapterId]);
  const order = rows.map((row) => row.id).filter((id) => !fresh.has(id));
  let anchor: number | null = null;
  batch.forEach((item, index) => {
    if (!item.isNew) {
      anchor = order.indexOf(item.id);
      return;
    }
    if (anchor === null) {
      const next = batch.slice(index + 1).find((later) => !later.isNew);
      anchor = (next ? order.indexOf(next.id) : order.length) - 1;
    }
    order.splice(anchor + 1, 0, item.id);
    anchor += 1;
  });
  const { rowCount } = await client.query(
    `update handbook_items h set position = o.position
     from unnest($2::uuid[]) with ordinality as o (id, position)
     where h.id = o.id and h.chapter_id = $1 and h.position <> o.position`,
    [chapterId, order]
  );
  return rowCount ?? 0;
}

type KeptIds = { option?: (i: number) => string | undefined; matchItem?: (i: number) => string | undefined; block?: (i: number) => string | undefined };

// Ids for a batch item: kept from the stored item by position where there is one, new otherwise.
function itemIds(mediaId: (file: string) => string, kept: KeptIds): ItemIds {
  return {
    option: (i) => kept.option?.(i) ?? randomUUID(),
    matchItem: (i) => kept.matchItem?.(i) ?? randomUUID(),
    block: (i) => kept.block?.(i) ?? randomUUID(),
    media: mediaId,
  };
}

function keptQuestionIds(stored: StoredQuestion): KeptIds {
  const content = isRecord(stored.content) ? stored.content : {};
  const idAt = (list: unknown, i: number) => {
    const entry = Array.isArray(list) ? list[i] : undefined;
    return isRecord(entry) && typeof entry.id === "string" ? entry.id : undefined;
  };
  if (stored.type === "match_pictures") {
    const answer = isRecord(stored.answer) ? stored.answer : {};
    const matches = Array.isArray(answer.matches) ? answer.matches.filter(isRecord) : [];
    return {
      option: (i) => idAt(content.targets, i),
      matchItem: (i) => {
        const target = idAt(content.targets, i);
        const match = matches.find((m) => m.targetId === target);
        return typeof match?.itemId === "string" ? match.itemId : undefined;
      },
    };
  }
  return { option: (i) => idAt(content.options, i) };
}
