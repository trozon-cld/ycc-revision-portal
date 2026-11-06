import type { SessionPayload } from "@/lib/auth/jwt";
import { logActivity } from "@/lib/audit/log";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { countOf } from "@/lib/format";
import { getSignedUrls, isStorageConfigured, storeObject, type StorageArea } from "@/lib/storage/storage";
import { isMp3 } from "./audio";
import { pictureFileType } from "./restore";

// Server only: after a database restore, puts back picture and audio files the database lists but storage lacks.
// Never changes a row and never replaces a file that's there; each file must match its record.
export type FileKind = "pictures" | "audio";
export const FILE_KINDS: readonly FileKind[] = ["pictures", "audio"];
const AREA: Record<FileKind, StorageArea> = { pictures: "media", audio: "audio" };
const NOUN: Record<FileKind, string> = { pictures: "picture file", audio: "audio file" };
// Paths per check (a language's audio is a few thousand files at most).
export const MAX_CHECK_PATHS = 20_000;
// Storage is asked about this many files at a time.
const SIGN_BATCH = 500;
// "Put back missing files" entries in the activity log: at most this many an hour.
const RUNS_PER_HOUR = 30;
const NOT_SET_UP = "Storage isn't set up on the server, so files can't be put back.";

type Expected = Map<string, number | null>;

// Every file path the database lists for this kind, with its recorded size where there is one.
async function expectedFiles(kind: FileKind): Promise<Expected> {
  const { rows } = await pool.query<{ path: string; bytes: number | null }>(
    kind === "pictures"
      ? `select storage_path as path, byte_size as bytes from media union all select thumb_path, null from media`
      : `select storage_path as path, byte_size as bytes from page_audio union all select storage_path, byte_size from question_audio`
  );
  return new Map(rows.map((row) => [row.path, row.bytes === null ? null : Number(row.bytes)]));
}

async function storedOf(paths: string[], area: StorageArea): Promise<Set<string>> {
  const stored = new Set<string>();
  for (let start = 0; start < paths.length; start += SIGN_BATCH) {
    const urls = await getSignedUrls(paths.slice(start, start + SIGN_BATCH), 60, area);
    for (const path of urls.keys()) stored.add(path);
  }
  return stored;
}

export type MissingCheck =
  | { ok: true; upload: string[]; notInFile: number; notInFileExamples: string[]; alreadyThere: number; expected: number }
  | { ok: false; error: string };

// Which of the file's paths are listed by the database and missing from storage; nothing is uploaded yet.
export async function checkMissingFiles(kind: FileKind, paths: string[]): Promise<MissingCheck> {
  if (!isStorageConfigured()) return { ok: false, error: NOT_SET_UP };
  const expected = await expectedFiles(kind);
  const listed = [...expected.keys()];
  const stored = await storedOf(listed, AREA[kind]);
  const missing = listed.filter((path) => !stored.has(path));
  const inFile = new Set(paths);
  const notInFile = missing.filter((path) => !inFile.has(path));
  return {
    ok: true,
    upload: missing.filter((path) => inFile.has(path)),
    notInFile: notInFile.length,
    notInFileExamples: notInFile.slice(0, 5),
    alreadyThere: stored.size,
    expected: listed.length,
  };
}

export type PutBack = { ok: true; skipped: boolean } | { ok: false; error: string };

// One file: listed by the database, missing from storage, the right kind of file and the recorded size.
export async function putBackFile(kind: FileKind, path: string, bytes: Uint8Array): Promise<PutBack> {
  if (!isStorageConfigured()) return { ok: false, error: NOT_SET_UP };
  const shortPath = path.slice(0, 120);
  const { rows } = await pool.query<{ bytes: number | null }>(
    kind === "pictures"
      ? `select byte_size as bytes from media where storage_path = $1 union all select null from media where thumb_path = $1`
      : `select byte_size as bytes from page_audio where storage_path = $1 union all select byte_size from question_audio where storage_path = $1`,
    [path]
  );
  if (rows.length === 0) return { ok: false, error: `${shortPath} isn't listed in this database, so it wasn't put back.` };
  const recorded = rows[0].bytes === null ? null : Number(rows[0].bytes);
  if (recorded !== null && recorded !== bytes.length) return { ok: false, error: `${shortPath} doesn't match its record (a different size), so it wasn't put back.` };
  const type = kind === "pictures" ? pictureFileType(path, bytes) : bytes.length > 0 && isMp3(bytes) ? "audio/mpeg" : null;
  if (!type) return { ok: false, error: `${shortPath} isn't a ${kind === "pictures" ? "picture" : "MP3 file"} the portal saved, so it wasn't put back.` };
  if ((await storedOf([path], AREA[kind])).has(path)) return { ok: true, skipped: true };
  // No overwrite: if the file arrived in the meantime, storage refuses and the one there stays.
  try {
    await storeObject(path, new Blob([bytes as BlobPart], { type }), type, { area: AREA[kind] });
  } catch (error) {
    if ((await storedOf([path], AREA[kind])).has(path)) return { ok: true, skipped: true };
    throw error;
  }
  return { ok: true, skipped: false };
}

// One activity-log entry per run that put files back, with what's still missing counted again here.
export async function logPutBack(session: SessionPayload, kind: FileKind, putBack: number): Promise<{ ok: true; stillMissing: number } | { ok: false; error: string }> {
  if (!isStorageConfigured()) return { ok: false, error: NOT_SET_UP };
  const expected = [...(await expectedFiles(kind)).keys()];
  const stillMissing = expected.length - (await storedOf(expected, AREA[kind])).size;
  if (putBack > 0) {
    const { rows } = await pool.query<{ n: number }>(
      `select count(*)::int as n from activity_logs where action = 'content.files_restored' and created_at > now() - interval '1 hour'`
    );
    if (rows[0].n < RUNS_PER_HOUR) {
      await withTransaction((client) =>
        logActivity(client, session, "content.files_restored", { type: "backup", id: null, label: kind === "pictures" ? "Pictures" : "Audio" }, {
          result: `${countOf(putBack, NOUN[kind])} put back · ${stillMissing} still missing`,
        })
      );
    }
  }
  return { ok: true, stillMissing };
}
