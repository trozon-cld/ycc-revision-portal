import type { PoolClient } from "pg";
import type { SessionPayload } from "@/lib/auth/jwt";
import { logActivity } from "@/lib/audit/log";
import { parseBlocks, type Block } from "@/lib/content/blocks";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { isTranslatedLanguage, voiceLanguage } from "./languages";
import { translatePage } from "./make";
import { VoiceQuotaError } from "./quota";
import { VoiceError } from "./services";
import type { TranslationRow } from "./status";
import { checkEditedTranslation } from "./translation";

// Server-only: a page's translations (V2). Translations are made from the saved page; edits and checks
// are guarded by the translation's revision, and every change is logged in the same transaction.

export type TranslationSummary = TranslationRow & { language: string; updatedAt: string; checkedAt: string | null };
export type TranslationResult = { ok: true; translation: TranslationSummary } | { ok: false; error: string; conflict?: boolean };

const NOT_FOUND = "This page no longer exists.";
const SUMMARY_COLUMNS = `language, source_version, revision, status, updated_at, checked_at`;

type SummaryRow = { language: string; source_version: number; revision: number; status: "draft" | "checked"; updated_at: Date; checked_at: Date | null };

function toSummary(row: SummaryRow): TranslationSummary {
  return {
    language: row.language,
    sourceVersion: row.source_version,
    revision: row.revision,
    status: row.status,
    updatedAt: row.updated_at.toISOString(),
    checkedAt: row.checked_at ? row.checked_at.toISOString() : null,
  };
}

export async function loadTranslationSummaries(pageId: string): Promise<TranslationSummary[]> {
  const { rows } = await pool.query<SummaryRow>(`select ${SUMMARY_COLUMNS} from page_translations where content_page_id = $1`, [pageId]);
  return rows.map(toSummary);
}

export async function loadTranslationBlocks(pageId: string, language: string): Promise<{ summary: TranslationSummary; blocks: Block[] } | null> {
  const { rows } = await pool.query<SummaryRow & { blocks: unknown }>(
    `select ${SUMMARY_COLUMNS}, blocks from page_translations where content_page_id = $1 and language = $2`,
    [pageId, language]
  );
  if (!rows[0]) return null;
  const parsed = parseBlocks(rows[0].blocks);
  return { summary: toSummary(rows[0]), blocks: parsed.ok ? parsed.blocks : [] };
}

type PageRow = { title: string; blocks: unknown; content_version: number };

async function readPage(client: PoolClient | typeof pool, pageId: string, lock = ""): Promise<PageRow | null> {
  const { rows } = await client.query<PageRow>(`select title, blocks, content_version from content_pages where id = $1 ${lock}`, [pageId]);
  return rows[0] ?? null;
}

function languageName(code: string) {
  return voiceLanguage(code)?.name ?? code;
}

function serviceError(error: unknown): TranslationResult {
  if (error instanceof VoiceError) {
    if (error.detail) console.error("Voice service:", error.kind, error.detail);
    return { ok: false, error: error.message };
  }
  if (error instanceof VoiceQuotaError) return { ok: false, error: error.message };
  throw error;
}

// A new translation from the saved English page (replaces any earlier one, which goes back to draft).
export async function generateTranslation(session: SessionPayload, pageId: string, language: string): Promise<TranslationResult> {
  if (!isTranslatedLanguage(language)) return { ok: false, error: "Choose a language." };
  const page = await readPage(pool, pageId);
  if (!page) return { ok: false, error: NOT_FOUND };
  const parsed = parseBlocks(page.blocks);
  if (!parsed.ok || parsed.blocks.length === 0) return { ok: false, error: "This page has no content to translate yet." };

  let translated: Block[];
  try {
    translated = (await translatePage(session.sub, parsed.blocks, language)).blocks;
  } catch (error) {
    return serviceError(error);
  }

  return withTransaction<TranslationResult>(async (client) => {
    const current = await readPage(client, pageId, "for share");
    if (!current) return { ok: false, error: NOT_FOUND };
    if (current.content_version !== page.content_version) {
      return { ok: false, error: "The page changed while this was being translated. Please try again." };
    }
    const { rows } = await client.query<SummaryRow>(
      `insert into page_translations (content_page_id, language, blocks, source_version)
       values ($1, $2, $3, $4)
       on conflict (content_page_id, language) do update
         set blocks = excluded.blocks, source_version = excluded.source_version, revision = page_translations.revision + 1,
             status = 'draft', checked_by = null, checked_at = null, updated_at = now()
       returning ${SUMMARY_COLUMNS}`,
      [pageId, language, JSON.stringify(translated), page.content_version]
    );
    await logActivity(client, session, "page_translation.generated", { type: "page", id: pageId, label: current.title }, {
      language: languageName(language),
      pageVersion: `Version ${page.content_version}`,
    });
    return { ok: true, translation: toSummary(rows[0]) };
  });
}

// Staff edits: the same blocks as the English page now (an edit brings the translation up to date with
// it); goes back to draft. Refused if someone else changed the translation since it was opened.
export async function saveTranslationEdit(
  session: SessionPayload,
  pageId: string,
  language: string,
  expectedRevision: number,
  edited: unknown
): Promise<TranslationResult> {
  if (!isTranslatedLanguage(language)) return { ok: false, error: "Choose a language." };
  return withTransaction<TranslationResult>(async (client) => {
    const page = await readPage(client, pageId, "for share");
    if (!page) return { ok: false, error: NOT_FOUND };
    const { rows } = await client.query<SummaryRow>(
      `select ${SUMMARY_COLUMNS} from page_translations where content_page_id = $1 and language = $2 for update`,
      [pageId, language]
    );
    const existing = rows[0];
    if (!existing) return { ok: false, error: "This translation no longer exists. Translate the page first." };
    if (existing.revision !== expectedRevision) {
      return { ok: false, conflict: true, error: "Someone else changed this translation while you were editing. Copy anything you need, then reload the page." };
    }
    const english = parseBlocks(page.blocks);
    if (!english.ok) return { ok: false, error: english.error };
    const checked = checkEditedTranslation(english.blocks, edited);
    if (!checked.ok) {
      return { ok: false, error: `${checked.error} If the English page gained or lost blocks, translate it again.` };
    }
    const { rows: same } = await client.query<{ same: boolean }>(
      `select blocks = $3::jsonb and source_version = $4 as same from page_translations where content_page_id = $1 and language = $2`,
      [pageId, language, JSON.stringify(checked.blocks), page.content_version]
    );
    if (same[0].same) return { ok: true, translation: toSummary(existing) };
    const { rows: saved } = await client.query<SummaryRow>(
      `update page_translations
       set blocks = $3, source_version = $4, revision = revision + 1, status = 'draft', checked_by = null, checked_at = null, updated_at = now()
       where content_page_id = $1 and language = $2
       returning ${SUMMARY_COLUMNS}`,
      [pageId, language, JSON.stringify(checked.blocks), page.content_version]
    );
    await logActivity(client, session, "page_translation.edited", { type: "page", id: pageId, label: page.title }, {
      language: languageName(language),
    });
    return { ok: true, translation: toSummary(saved[0]) };
  });
}

// A reader of the language has checked it: only for an up-to-date draft, as it was when they read it.
export async function markTranslationChecked(session: SessionPayload, pageId: string, language: string, expectedRevision: number): Promise<TranslationResult> {
  if (!isTranslatedLanguage(language)) return { ok: false, error: "Choose a language." };
  return withTransaction<TranslationResult>(async (client) => {
    const page = await readPage(client, pageId, "for share");
    if (!page) return { ok: false, error: NOT_FOUND };
    const { rows } = await client.query<SummaryRow>(
      `select ${SUMMARY_COLUMNS} from page_translations where content_page_id = $1 and language = $2 for update`,
      [pageId, language]
    );
    const existing = rows[0];
    if (!existing) return { ok: false, error: "This translation no longer exists. Translate the page first." };
    if (existing.revision !== expectedRevision) {
      return { ok: false, conflict: true, error: "Someone else changed this translation while you were reading it. Reload the page and check it again." };
    }
    if (existing.source_version !== page.content_version) {
      return { ok: false, error: "The English page changed since this was translated. Translate it again, or edit and save it first." };
    }
    if (existing.status === "checked") return { ok: true, translation: toSummary(existing) };
    const { rows: saved } = await client.query<SummaryRow>(
      `update page_translations set status = 'checked', checked_by = $3, checked_at = now(), updated_at = now()
       where content_page_id = $1 and language = $2
       returning ${SUMMARY_COLUMNS}`,
      [pageId, language, session.sub]
    );
    await logActivity(client, session, "page_translation.checked", { type: "page", id: pageId, label: page.title }, {
      language: languageName(language),
    });
    return { ok: true, translation: toSummary(saved[0]) };
  });
}

