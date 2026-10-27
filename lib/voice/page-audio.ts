import type { PoolClient } from "pg";
import type { SessionPayload } from "@/lib/auth/jwt";
import { logActivity } from "@/lib/audit/log";
import { parseBlocks, type Block } from "@/lib/content/blocks";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { formatDuration } from "@/lib/format";
import { isStorageConfigured } from "@/lib/storage/storage";
import {
  AUDIO_NOT_CONFIGURED,
  audioCanStart,
  audioFileLink,
  deleteAudioFilesQuietly,
  storeAudioFile,
  type AudioDeleteResult,
  type AudioLinkResult,
  type AudioResult,
  type AudioSummary,
} from "./audio-files";
import { findVoiceLanguage } from "./language-store";
import { SOURCE_LANGUAGE } from "./languages";
import { speakPage, voiceFailure, type PageSpeech } from "./make";
import { audioSourceVersion, type TranslationRow } from "./status";

// Server-only: a page's audio (V3), one MP3 per page and language. English is read from the saved page,
// other languages from a checked, up-to-date translation. Files are stored first, then recorded and logged.

const NOT_FOUND = "This page no longer exists.";
const SUMMARY_COLUMNS = `language, source_version, duration_ms, byte_size, created_at`;
type SummaryRow = { language: string; source_version: number; duration_ms: number; byte_size: number; created_at: Date };

function toSummary(row: SummaryRow): AudioSummary {
  return {
    language: row.language,
    sourceVersion: row.source_version,
    durationMs: row.duration_ms,
    byteSize: row.byte_size,
    createdAt: row.created_at.toISOString(),
  };
}

export async function loadAudioSummaries(pageId: string): Promise<AudioSummary[]> {
  const { rows } = await pool.query<SummaryRow>(`select ${SUMMARY_COLUMNS} from page_audio where content_page_id = $1`, [pageId]);
  return rows.map(toSummary);
}

// The storage paths of a page's audio, read before the page is deleted (its rows go with it).
export async function pageAudioPaths(client: PoolClient, pageId: string): Promise<string[]> {
  const { rows } = await client.query<{ storage_path: string }>(`select storage_path from page_audio where content_page_id = $1`, [pageId]);
  return rows.map((row) => row.storage_path);
}

type Source = { title: string; blocks: Block[]; version: number } | { error: string };

// What the audio is read from, and its version: the page for English, a checked translation otherwise.
async function readSource(client: PoolClient | typeof pool, pageId: string, language: string, lock = ""): Promise<Source> {
  const { rows } = await client.query<{ title: string; blocks: unknown; content_version: number }>(
    `select title, blocks, content_version from content_pages where id = $1 ${lock}`,
    [pageId]
  );
  const page = rows[0];
  if (!page) return { error: NOT_FOUND };
  if (language === SOURCE_LANGUAGE) {
    const parsed = parseBlocks(page.blocks);
    if (!parsed.ok || parsed.blocks.length === 0) return { error: "This page has no content to read aloud yet." };
    return { title: page.title, blocks: parsed.blocks, version: page.content_version };
  }
  const { rows: found } = await client.query<{ blocks: unknown; source_version: number; revision: number; status: TranslationRow["status"] }>(
    `select blocks, source_version, revision, status from page_translations where content_page_id = $1 and language = $2 ${lock}`,
    [pageId, language]
  );
  const translation = found[0];
  const version = translation
    ? audioSourceVersion(false, page.content_version, { sourceVersion: translation.source_version, revision: translation.revision, status: translation.status })
    : null;
  if (!translation || version === null) return { error: "Audio can only be made from a checked, up-to-date translation. Check the translation first." };
  const parsed = parseBlocks(translation.blocks);
  if (!parsed.ok) return { error: parsed.error };
  return { title: page.title, blocks: parsed.blocks, version };
}

// Makes (or replaces) the page's audio in one language. The old file is removed once the new one is recorded.
export async function generateAudio(session: SessionPayload, pageId: string, language: string): Promise<AudioResult> {
  const lang = await findVoiceLanguage(language);
  if (!lang) return { ok: false, error: "Choose a language." };
  if (!isStorageConfigured()) return { ok: false, error: AUDIO_NOT_CONFIGURED };
  const source = await readSource(pool, pageId, lang.code);
  if ("error" in source) return { ok: false, error: source.error };
  const blocked = await audioCanStart();
  if (blocked) return { ok: false, error: blocked };

  let speech: PageSpeech;
  try {
    speech = await speakPage(session.sub, source.blocks, lang.code);
  } catch (error) {
    return voiceFailure(error);
  }

  const path = `pages/${pageId}/${lang.code}-${crypto.randomUUID()}.mp3`;
  const storeError = await storeAudioFile(path, speech.mp3);
  if (storeError) return { ok: false, error: storeError };

  let outcome: { result: AudioResult; oldPath: string | null };
  try {
    outcome = await withTransaction(async (client) => {
      const current = await readSource(client, pageId, lang.code, "for share");
      if ("error" in current) return { result: { ok: false, error: current.error } as AudioResult, oldPath: null };
      if (current.version !== source.version) {
        const what = lang.code === SOURCE_LANGUAGE ? "page" : "translation";
        return { result: { ok: false, error: `The ${what} changed while the audio was being made. Please try again.` } as AudioResult, oldPath: null };
      }
      const { rows: old } = await client.query<{ storage_path: string }>(
        `select storage_path from page_audio where content_page_id = $1 and language = $2 for update`,
        [pageId, lang.code]
      );
      const { rows } = await client.query<SummaryRow>(
        `insert into page_audio (content_page_id, language, source_version, storage_path, byte_size, duration_ms, provider, voice, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (content_page_id, language) do update
           set source_version = excluded.source_version, storage_path = excluded.storage_path, byte_size = excluded.byte_size,
               duration_ms = excluded.duration_ms, mime_type = excluded.mime_type, provider = excluded.provider, voice = excluded.voice,
               created_by = excluded.created_by, created_at = now()
         returning ${SUMMARY_COLUMNS}`,
        [pageId, lang.code, source.version, path, speech.mp3.byteLength, Math.max(1, speech.durationMs), speech.provider, speech.voice, session.sub]
      );
      await logActivity(client, session, "page_audio.generated", { type: "page", id: pageId, label: current.title }, {
        language: lang.name,
        length: formatDuration(Math.max(1, Math.round(speech.durationMs / 1000))),
      });
      return { result: { ok: true, audio: toSummary(rows[0]) } as AudioResult, oldPath: old[0]?.storage_path ?? null };
    });
  } catch (error) {
    await deleteAudioFilesQuietly([path]);
    throw error;
  }

  if (!outcome.result.ok) await deleteAudioFilesQuietly([path]);
  else if (outcome.oldPath) await deleteAudioFilesQuietly([outcome.oldPath]);
  return outcome.result;
}

export async function deleteAudio(session: SessionPayload, pageId: string, language: string): Promise<AudioDeleteResult> {
  const lang = await findVoiceLanguage(language, "any");
  if (!lang) return { ok: false, error: "Choose a language." };
  const result = await withTransaction<{ ok: false; error: string } | { ok: true; path: string }>(async (client) => {
    const { rows: page } = await client.query<{ title: string }>(`select title from content_pages where id = $1 for share`, [pageId]);
    if (!page[0]) return { ok: false, error: NOT_FOUND };
    const { rows } = await client.query<{ storage_path: string }>(
      `delete from page_audio where content_page_id = $1 and language = $2 returning storage_path`,
      [pageId, lang.code]
    );
    if (!rows[0]) return { ok: false, error: "This audio has already been deleted." };
    await logActivity(client, session, "page_audio.deleted", { type: "page", id: pageId, label: page[0].title }, { language: lang.name });
    return { ok: true, path: rows[0].storage_path };
  });
  if (!result.ok) return result;
  await deleteAudioFilesQuietly([result.path]);
  return { ok: true };
}

export async function audioPreviewLink(pageId: string, language: string): Promise<AudioLinkResult> {
  if (!(await findVoiceLanguage(language, "any"))) return audioFileLink(undefined);
  const { rows } = await pool.query<{ storage_path: string }>(
    `select storage_path from page_audio where content_page_id = $1 and language = $2`,
    [pageId, language]
  );
  return audioFileLink(rows[0]?.storage_path);
}
