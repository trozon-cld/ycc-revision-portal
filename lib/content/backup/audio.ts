import type { SessionPayload } from "@/lib/auth/jwt";
import { logActivity } from "@/lib/audit/log";
import { ACCESS_TIME_ZONE } from "@/lib/candidates/access";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { countOf, formatBytes } from "@/lib/format";
import { STORAGE_LIMIT_BYTES } from "@/lib/media/limits";
import { getSignedUrls, isStorageConfigured, storeObject } from "@/lib/storage/storage";
import { storedBytes } from "@/lib/storage/usage";
import { isRecord } from "@/lib/text";
import { AUDIO_NOT_CONFIGURED } from "@/lib/voice/audio-files";
import {
  AUDIO_BACKUP_FORMAT,
  AUDIO_BACKUP_VERSION,
  AUDIO_FILES_FOLDER,
  AUDIO_TABLES,
  type AudioBackupData,
  type AudioBackupManifest,
  type AudioCheck,
  type AudioLanguageRow,
  type AudioRestoreResult,
  type AudioRow,
  type AudioTable,
} from "./audio-format";
import { MAX_AUDIO_FILE_BYTES } from "./limits";

// Server-only: one language's audio (records and MP3 files) out of and back into a project. Files keep their storage
// paths, so each record still points at its own file; the text an audio was made from comes along, so it's up to date
// only where the page, question or translation still matches.

const LINK_SECONDS = 60 * 60;
const SIGN_BATCH = 200;
const EXACT_TIME = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';
// Columns kept in a backup (created_by links to a staff account, which doesn't exist in another project).
const COLUMNS: Record<AudioTable, string[]> = {
  page_audio: ["content_page_id", "language", "source_version", "storage_path", "byte_size", "duration_ms", "mime_type", "provider", "voice", "created_at"],
  question_audio: ["question_id", "language", "source", "source_revision", "storage_path", "byte_size", "duration_ms", "mime_type", "provider", "voice", "created_at"],
};
const ITEM: Record<AudioTable, { key: string; table: string; folder: string; noun: string }> = {
  page_audio: { key: "content_page_id", table: "content_pages", folder: "pages", noun: "page" },
  question_audio: { key: "question_id", table: "questions", folder: "questions", noun: "question" },
};
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
// The path the portal gives an audio file: pages/<page id>/<language>-<random id>.mp3 (questions/… alike).
const AUDIO_PATH = new RegExp(`^(pages|questions)/(${UUID})/([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?)-${UUID}\\.mp3$`);
const FILE_NAME = /^ycc-audio-[a-z]{2,3}(-[A-Za-z0-9]{2,8})?-\d{4}-\d\d-\d\d-\d{4}\.zip$/;
const DAMAGED = "The audio backup is damaged.";

// Every language with audio, for the Backup page.
export async function listAudioLanguages(): Promise<AudioLanguageRow[]> {
  const { rows } = await pool.query<{ code: string; name: string; pages: number; questions: number; bytes: string }>(
    `with a as (
       select language, 1 as page, 0 as question, byte_size from page_audio
       union all select language, 0, 1, byte_size from question_audio)
     select l.code, l.name, sum(a.page)::int as pages, sum(a.question)::int as questions, sum(a.byte_size)::bigint as bytes
     from a join voice_languages l on l.code = a.language
     group by l.code, l.name
     order by (l.code = 'en') desc, l.name`
  );
  return rows.map((row) => ({ code: row.code, name: row.name, pages: row.pages, questions: row.questions, bytes: Number(row.bytes) }));
}

export type AudioBackupResult = { ok: true; data: AudioBackupData } | { ok: false; error: string };

// One language's audio records and a short-lived link to each file, read in one snapshot. A missing file stops it.
export async function readAudioBackup(session: SessionPayload, language: unknown): Promise<AudioBackupResult> {
  if (!isStorageConfigured()) return { ok: false, error: AUDIO_NOT_CONFIGURED };
  if (typeof language !== "string" || !LANGUAGE_CODE.test(language)) return { ok: false, error: "Choose a language." };
  return withTransaction(async (client) => {
    await client.query("set transaction isolation level repeatable read, read only");
    const { rows: found } = await client.query<{ name: string }>(`select name from voice_languages where code = $1`, [language]);
    if (!found[0]) return { ok: false, error: "That language no longer exists. Reload the page." };
    const data = {} as AudioBackupData["data"];
    for (const table of AUDIO_TABLES) {
      const fields = COLUMNS[table].map((name) => (name === "created_at" ? `to_char(created_at at time zone 'UTC', '${EXACT_TIME}') as created_at` : name));
      const { rows } = await client.query<AudioRow>(`select ${fields.join(", ")} from ${table} where language = $1 order by ${ITEM[table].key}`, [language]);
      data[table] = rows;
    }
    const all = AUDIO_TABLES.flatMap((table) => data[table]);
    if (all.length === 0) return { ok: false, error: `There's no ${found[0].name} audio to back up.` };

    const urls = new Map<string, string>();
    const paths = all.map((row) => String(row.storage_path));
    for (let start = 0; start < paths.length; start += SIGN_BATCH) {
      for (const [path, url] of await getSignedUrls(paths.slice(start, start + SIGN_BATCH), LINK_SECONDS, "audio")) urls.set(path, url);
    }
    const missing = paths.filter((path) => !urls.has(path));
    if (missing.length > 0) {
      return {
        ok: false,
        error: `${countOf(missing.length, "audio file")} can't be found in storage. Make ${missing.length === 1 ? "that audio" : "those audio files"} again on the Translations pages, then try again.`,
      };
    }

    const { rows: when } = await client.query<{ created_at: string; stamp: string; by: string }>(
      `select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
              to_char(now() at time zone $1, 'YYYY-MM-DD-HH24MI') as stamp,
              coalesce((select email from users where id = $2), $3) as by`,
      [ACCESS_TIME_ZONE, session.sub, session.email]
    );
    const manifest: AudioBackupManifest = {
      format: AUDIO_BACKUP_FORMAT,
      version: AUDIO_BACKUP_VERSION,
      language: { code: language, name: found[0].name },
      createdAt: when[0].created_at,
      createdBy: when[0].by,
      pages: data.page_audio.length,
      questions: data.question_audio.length,
      bytes: all.reduce((sum, row) => sum + Number(row.byte_size), 0),
    };
    const files = all.map((row) => ({ zipPath: `${AUDIO_FILES_FOLDER}/${String(row.storage_path)}`, bytes: Number(row.byte_size), url: urls.get(String(row.storage_path)) as string }));
    return { ok: true, data: { fileName: `ycc-audio-${language}-${when[0].stamp}.zip`, manifest, data, files } };
  });
}

// Logged once the browser has built and saved the zip. The counts are checked for shape only.
export async function recordAudioBackupSaved(session: SessionPayload, raw: unknown): Promise<boolean> {
  if (!isRecord(raw) || typeof raw.fileName !== "string" || !FILE_NAME.test(raw.fileName)) return false;
  const manifest = raw.manifest;
  if (!isRecord(manifest) || !isRecord(manifest.language) || typeof manifest.language.code !== "string") return false;
  const [pages, questions, bytes] = [manifest.pages, manifest.questions, manifest.bytes];
  if (![pages, questions, bytes].every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0)) return false;
  const { rows } = await pool.query<{ name: string }>(`select name from voice_languages where code = $1`, [manifest.language.code]);
  if (!rows[0]) return false;
  const fileName = raw.fileName;
  await withTransaction((client) =>
    logActivity(client, session, "content.audio_backup_downloaded", { type: "backup", id: null, label: fileName }, {
      language: rows[0].name,
      items: itemCounts(pages as number, questions as number),
      size: formatBytes(bytes as number),
    })
  );
  return true;
}

type Plan = { language: { code: string; name: string }; restore: Record<AudioTable, AudioRow[]>; skipped: string[]; skippedCount: number };

// Before any file is uploaded: which records can come back (their page or question exists here, and has no audio in
// that language yet). The browser then uploads only those records' files.
export async function checkAudioRestore(raw: unknown): Promise<AudioCheck> {
  if (!isStorageConfigured()) return { ok: false, problems: [AUDIO_NOT_CONFIGURED] };
  const plan = await planRestore(raw);
  if ("problems" in plan) return { ok: false, problems: plan.problems };
  const restore = AUDIO_TABLES.flatMap((table) => plan.restore[table]);
  const bytes = restore.reduce((sum, row) => sum + Number(row.byte_size), 0);
  if (restore.length > 0 && (await storedBytes()) + bytes > STORAGE_LIMIT_BYTES) {
    return { ok: false, problems: ["There isn't enough storage left for this audio. Delete pictures or audio you no longer need, then try again."] };
  }
  return { ok: true, language: plan.language.name, paths: restore.map((row) => String(row.storage_path)), skipped: plan.skipped, skippedCount: plan.skippedCount };
}

// One MP3 from an audio backup, stored at its own path (replaced if it's already there from an earlier try).
export async function restoreAudioFile(path: string, bytes: Uint8Array): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isStorageConfigured()) return { ok: false, error: AUDIO_NOT_CONFIGURED };
  if (!AUDIO_PATH.test(path) || bytes.length === 0 || bytes.length > MAX_AUDIO_FILE_BYTES || !isMp3(bytes)) {
    return { ok: false, error: `${DAMAGED} (${path.slice(0, 100)} isn't an audio file the portal saved).` };
  }
  if ((await storedBytes()) + bytes.length > STORAGE_LIMIT_BYTES) {
    return { ok: false, error: "Storage is full. Delete pictures or audio you no longer need, then try again." };
  }
  await storeObject(path, new Blob([bytes as BlobPart], { type: "audio/mpeg" }), "audio/mpeg", { area: "audio", restore: true });
  return { ok: true };
}

// Saves the records in one transaction once their files are uploaded; records whose file isn't in storage, or that
// gained audio in the meantime, are skipped. One log entry.
export async function restoreAudio(session: SessionPayload, raw: unknown): Promise<AudioRestoreResult> {
  if (!isStorageConfigured()) return { ok: false, problems: [AUDIO_NOT_CONFIGURED] };
  const plan = await planRestore(raw);
  if ("problems" in plan) return { ok: false, problems: plan.problems };
  const wanted = AUDIO_TABLES.flatMap((table) => plan.restore[table].map((row) => String(row.storage_path)));
  const stored = new Set<string>();
  for (let start = 0; start < wanted.length; start += SIGN_BATCH) {
    for (const path of (await getSignedUrls(wanted.slice(start, start + SIGN_BATCH), 60, "audio")).keys()) stored.add(path);
  }
  const notStored = wanted.filter((path) => !stored.has(path)).length;
  return withTransaction(async (client) => {
    let restored = 0;
    for (const table of AUDIO_TABLES) {
      const rows = plan.restore[table].filter((row) => stored.has(String(row.storage_path)));
      if (rows.length === 0) continue;
      const { key, table: items } = ITEM[table];
      const columns = COLUMNS[table].join(", ");
      // The page or question and the language must still exist; a record that's now there (or a path in use) is skipped.
      const { rowCount } = await client.query(
        `insert into ${table} (${columns})
         select ${columns} from jsonb_populate_recordset(null::${table}, $1::jsonb) r
         where exists (select 1 from ${items} i where i.id = r.${key})
           and exists (select 1 from voice_languages l where l.code = r.language)
         on conflict do nothing`,
        [JSON.stringify(rows)]
      );
      restored += rowCount ?? 0;
    }
    const skipped = plan.skippedCount + (wanted.length - restored);
    if (restored === 0) return { ok: false, problems: ["Nothing was restored: every item in this backup already has audio here or no longer exists."] };
    await logActivity(client, session, "content.audio_restored", { type: "backup", id: null, label: plan.language.name }, {
      language: plan.language.name,
      restored: String(restored),
      skipped: String(skipped),
    });
    return { ok: true, restored, skipped, notStored };
  });
}

// Checks the backup's shape and sorts its records into ones that can come back and ones skipped (with reasons).
async function planRestore(raw: unknown): Promise<Plan | { problems: string[] }> {
  if (!isRecord(raw) || !isRecord(raw.manifest) || !isRecord(raw.data)) return { problems: [DAMAGED] };
  const manifest = raw.manifest;
  if (manifest.format !== AUDIO_BACKUP_FORMAT) return { problems: ["This isn't an audio backup. Choose a file downloaded from Audio backups."] };
  if (manifest.version !== AUDIO_BACKUP_VERSION) return { problems: [`This audio backup is version ${String(manifest.version)}; this portal restores version ${AUDIO_BACKUP_VERSION}.`] };
  const lang = manifest.language;
  if (!isRecord(lang) || typeof lang.code !== "string" || !LANGUAGE_CODE.test(lang.code) || typeof lang.name !== "string") return { problems: [DAMAGED] };
  const code = lang.code;

  const rows = {} as Record<AudioTable, AudioRow[]>;
  for (const table of AUDIO_TABLES) {
    const list = raw.data[table];
    const expected = table === "page_audio" ? manifest.pages : manifest.questions;
    if (!Array.isArray(list) || !list.every(isRecord) || list.length !== expected) return { problems: [`${DAMAGED} (${table}).`] };
    for (const row of list) {
      const match = AUDIO_PATH.exec(String(row.storage_path));
      const sizeOk = Number.isInteger(row.byte_size) && Number(row.byte_size) > 0 && Number(row.byte_size) <= MAX_AUDIO_FILE_BYTES;
      if (row.language !== code || !match || match[1] !== ITEM[table].folder || match[2] !== row[ITEM[table].key] || match[3] !== code || !sizeOk) {
        return { problems: [`${DAMAGED} (${table}).`] };
      }
    }
    rows[table] = list as AudioRow[];
  }

  const { rows: found } = await pool.query<{ name: string }>(`select name from voice_languages where code = $1`, [code]);
  if (!found[0]) return { problems: [`This project has no ${lang.name} language. Add it under Languages and audio, then restore again.`] };

  const restore = {} as Record<AudioTable, AudioRow[]>;
  const reasons: string[] = [];
  let skippedCount = 0;
  for (const table of AUDIO_TABLES) {
    const { key, table: items, noun } = ITEM[table];
    const ids = rows[table].map((row) => String(row[key]));
    const { rows: state } = await pool.query<{ id: string; present: boolean; has_audio: boolean }>(
      `select x.id::text, exists (select 1 from ${items} i where i.id = x.id) as present,
              exists (select 1 from ${table} a where a.${key} = x.id and a.language = $2) as has_audio
       from unnest($1::uuid[]) as x(id)`,
      [ids, code]
    );
    const byId = new Map(state.map((row) => [row.id, row]));
    const gone = rows[table].filter((row) => !byId.get(String(row[key]))?.present);
    const already = rows[table].filter((row) => byId.get(String(row[key]))?.present && byId.get(String(row[key]))?.has_audio);
    restore[table] = rows[table].filter((row) => byId.get(String(row[key]))?.present && !byId.get(String(row[key]))?.has_audio);
    if (already.length > 0) reasons.push(`${countOf(already.length, noun)} already ${already.length === 1 ? "has" : "have"} ${found[0].name} audio here (kept as it is)`);
    if (gone.length > 0) reasons.push(`${countOf(gone.length, noun)} ${gone.length === 1 ? "isn't" : "aren't"} in this project`);
    skippedCount += already.length + gone.length;
  }
  return { language: { code, name: found[0].name }, restore, skipped: reasons, skippedCount };
}

// An MP3 starts with an ID3 tag or an MPEG audio frame (11 set bits).
function isMp3(bytes: Uint8Array): boolean {
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
}

function itemCounts(pages: number, questions: number): string {
  return [pages > 0 ? countOf(pages, "page") : "", questions > 0 ? countOf(questions, "question") : ""].filter(Boolean).join(" · ") || "none";
}
