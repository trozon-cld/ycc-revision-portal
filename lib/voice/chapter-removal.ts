import type { SessionPayload } from "@/lib/auth/jwt";
import { logActivity } from "@/lib/audit/log";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { countOf, formatBytes } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { listChapterOptions } from "@/lib/questions/queries";
import { deleteAudioFilesQuietly } from "./audio-files";
import { SOURCE_LANGUAGE } from "./languages";
import { BULK_ABANDONED_AFTER_MINUTES } from "./limits";

// Server only: one language's translations and audio in one chapter (its pages and Handbook questions), for Batch Generate's
// Remove. English is never removed. Rows go in one transaction with the log entry; the audio files straight after.
export type ChapterAssets = { translations: number; audio: number; bytes: number };

// Per chapter, what one language has there (chapters with nothing are left out).
export async function chapterLanguageAssets(code: string): Promise<Map<string, ChapterAssets>> {
  if (code === SOURCE_LANGUAGE) return new Map();
  const { rows } = await pool.query<{ chapter_id: string; translations: number; audio: number; bytes: string }>(
    `with assets as (
       select p.chapter_id, 1 as translation, 0 as audio, 0::bigint as bytes from page_translations t join content_pages p on p.id = t.content_page_id where t.language = $1
       union all
       select i.chapter_id, 1, 0, 0 from question_translations t join handbook_items i on i.question_id = t.question_id where t.language = $1
       union all
       select p.chapter_id, 0, 1, a.byte_size from page_audio a join content_pages p on p.id = a.content_page_id where a.language = $1
       union all
       select i.chapter_id, 0, 1, a.byte_size from question_audio a join handbook_items i on i.question_id = a.question_id where a.language = $1
     )
     select chapter_id, sum(translation)::int as translations, sum(audio)::int as audio, sum(bytes)::text as bytes from assets group by chapter_id`,
    [code]
  );
  return new Map(rows.map((row) => [row.chapter_id, { translations: row.translations, audio: row.audio, bytes: Number(row.bytes) }]));
}

export type RemovalResult = { ok: true; message: string } | { ok: false; error: string };

export async function removeChapterLanguage(session: SessionPayload, chapterId: string, code: string): Promise<RemovalResult> {
  if (code === SOURCE_LANGUAGE) return { ok: false, error: "English is the source language, so it can't be removed." };
  const chapter = isUuid(chapterId) ? (await listChapterOptions()).flatMap((section) => section.chapters).find((item) => item.id === chapterId) : undefined;
  if (!chapter) return { ok: false, error: "That chapter no longer exists. Reload the page." };

  const outcome = await withTransaction<{ result: RemovalResult; paths: string[] }>(async (client) => {
    const { rows: languages } = await client.query<{ name: string }>(`select name from voice_languages where code = $1 for update`, [code]);
    const language = languages[0];
    if (!language) return { result: { ok: false, error: "This language isn't in the list any more." }, paths: [] };
    // A run still going would add to the chapter again while it's being cleared.
    const { rows: running } = await client.query<{ email: string | null }>(
      `select u.email from voice_bulk_runs r left join users u on u.id = r.started_by
       where r.chapter_id = $1 and r.language = $2 and r.finished_at is null and r.last_step_at > now() - make_interval(mins => $3)`,
      [chapterId, code, BULK_ABANDONED_AFTER_MINUTES]
    );
    if (running.length) {
      return { result: { ok: false, error: `${running[0].email ?? "Someone"} is running ${chapter.label} in ${language.name}. Try again when it has finished.` }, paths: [] };
    }
    const pages = `select id from content_pages where chapter_id = $1`;
    // Questions by where they sit in the Handbook, as Batch Generate counts them.
    const questions = `select question_id from handbook_items where chapter_id = $1 and question_id is not null`;
    const { rows: files } = await client.query<{ storage_path: string; byte_size: number }>(
      `select storage_path, byte_size from page_audio where language = $2 and content_page_id in (${pages})
       union all
       select storage_path, byte_size from question_audio where language = $2 and question_id in (${questions})`,
      [chapterId, code]
    );
    const translations =
      ((await client.query(`delete from page_translations where language = $2 and content_page_id in (${pages})`, [chapterId, code])).rowCount ?? 0) +
      ((await client.query(`delete from question_translations where language = $2 and question_id in (${questions})`, [chapterId, code])).rowCount ?? 0);
    await client.query(`delete from page_audio where language = $2 and content_page_id in (${pages})`, [chapterId, code]);
    await client.query(`delete from question_audio where language = $2 and question_id in (${questions})`, [chapterId, code]);
    if (translations === 0 && files.length === 0) {
      return { result: { ok: false, error: `${chapter.label} has no ${language.name} translations or audio to remove.` }, paths: [] };
    }
    const bytes = files.reduce((sum, file) => sum + Number(file.byte_size), 0);
    const removed = `${countOf(translations, "translation")} and ${countOf(files.length, "audio file")} (${formatBytes(bytes)})`;
    await logActivity(client, session, "language.listen_removed", { type: "language", id: null, label: `${language.name} · ${chapter.label}` }, { result: `Removed ${removed}` });
    return { result: { ok: true, message: `Removed ${language.name} from ${chapter.label}: ${removed}.` }, paths: files.map((file) => file.storage_path) };
  });
  await deleteAudioFilesQuietly(outcome.paths);
  return outcome.result;
}
