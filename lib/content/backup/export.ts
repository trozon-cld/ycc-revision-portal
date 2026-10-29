import type { PoolClient } from "pg";
import type { SessionPayload } from "@/lib/auth/jwt";
import { logActivity } from "@/lib/audit/log";
import { ACCESS_TIME_ZONE } from "@/lib/candidates/access";
import { quoteIdent as quote } from "@/lib/db/identifiers";
import { withTransaction } from "@/lib/db/transaction";
import { countOf } from "@/lib/format";
import { isRecord } from "@/lib/text";
import { NOT_CONFIGURED } from "@/lib/media/upload";
import { getSignedUrls, isStorageConfigured } from "@/lib/storage/storage";
import {
  BACKUP_FORMAT,
  BACKUP_PARTS,
  BACKUP_VERSION,
  PICTURES_FOLDER,
  backupCounts,
  type BackupData,
  type BackupManifest,
  type BackupPart,
  type BackupPictureFile,
  type BackupRow,
} from "./format";

// Server-only: everything a backup holds, read in one snapshot so the parts always fit together.

export type BackupResult = { ok: true; data: BackupData } | { ok: false; error: string };

// Long enough to fetch a few hundred pictures one after another.
const LINK_SECONDS = 60 * 60;
const EXACT_TIME = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';
const BACKUP_FILE_NAME = /^ycc-backup-\d{4}-\d\d-\d\d-\d{4}\.zip$/;
const SIGN_BATCH = 200;

export async function readBackup(session: SessionPayload): Promise<BackupResult> {
  if (!isStorageConfigured()) return { ok: false, error: NOT_CONFIGURED };
  return withTransaction(async (client) => {
    await client.query("set transaction isolation level repeatable read, read only");
    const columns = await columnsOf(client);
    const tables: BackupManifest["tables"] = {};
    const parts = {} as BackupData["parts"];
    for (const part of Object.keys(BACKUP_PARTS) as BackupPart[]) {
      parts[part] = {};
      for (const table of BACKUP_PARTS[part]) {
        const { names, order, times } = columns.get(table) ?? { names: [], order: [], times: [] };
        const fields = names.map((name) => (times.includes(name) ? `to_char(${quote(name)} at time zone 'UTC', '${EXACT_TIME}') as ${quote(name)}` : quote(name)));
        const { rows } = await client.query<BackupRow>(`select ${fields.join(", ")} from ${quote(table)} order by ${order.map(quote).join(", ")}`);
        parts[part][table] = rows;
        tables[table] = { columns: names, rows: rows.length };
      }
    }

    const pictures = await pictureFiles(parts.content.media ?? []);
    if ("error" in pictures) return { ok: false, error: pictures.error };

    const { rows: when } = await client.query<{ created_at: string; stamp: string; by: string }>(
      `select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
              to_char(now() at time zone $1, 'YYYY-MM-DD-HH24MI') as stamp,
              coalesce((select email from users where id = $2), $3) as by`,
      [ACCESS_TIME_ZONE, session.sub, session.email]
    );
    const fileName = `ycc-backup-${when[0].stamp}.zip`;
    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: when[0].created_at,
      createdBy: when[0].by,
      tables,
      pictures: { files: pictures.files.length, bytes: pictures.files.reduce((sum, file) => sum + (file.bytes ?? 0), 0) },
    };
    return { ok: true, data: { fileName, manifest, parts, pictures: pictures.files } };
  });
}

// Logged once the browser has built and saved the zip, so "Last backup" never names one that didn't finish.
// Only the Superadmin can send this; the counts are the manifest the server made, checked for shape.
export async function recordBackupSaved(session: SessionPayload, raw: unknown): Promise<boolean> {
  if (!isRecord(raw) || typeof raw.fileName !== "string" || !BACKUP_FILE_NAME.test(raw.fileName) || !isRecord(raw.tables)) return false;
  const tables: BackupManifest["tables"] = {};
  for (const table of Object.values(BACKUP_PARTS).flat()) {
    const entry = raw.tables[table];
    const rows = isRecord(entry) ? entry.rows : null;
    if (typeof rows !== "number" || !Number.isInteger(rows) || rows < 0) return false;
    tables[table] = { columns: [], rows };
  }
  const fileName = raw.fileName;
  await withTransaction((client) => logActivity(client, session, "content.backup_downloaded", { type: "backup", id: null, label: fileName }, { items: backupSummary(tables) }));
  return true;
}

// Each table's columns in order, minus links to staff accounts (those don't exist in another project), its key for ordering,
// and its date columns (written as exact text: a JavaScript date would drop the microseconds).
async function columnsOf(client: PoolClient): Promise<Map<string, { names: string[]; order: string[]; times: string[] }>> {
  const names = Object.values(BACKUP_PARTS).flat();
  const { rows } = await client.query<{ table_name: string; names: string[]; ord: string[]; times: string[] }>(
    `select c.relname as table_name,
            array(select a.attname::text from pg_attribute a
                  where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                    and not exists (select 1 from pg_constraint f where f.conrelid = c.oid and f.contype = 'f'
                                    and f.confrelid = 'users'::regclass and a.attnum = any (f.conkey))
                  order by a.attnum) as names,
            array(select a.attname::text from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
                  where i.indrelid = c.oid and i.indisprimary order by array_position(i.indkey::int2[], a.attnum)) as ord,
            array(select a.attname::text from pg_attribute a
                  where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.atttypid = 'timestamptz'::regtype) as times
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any ($1::text[])`,
    [names]
  );
  return new Map(rows.map((row) => [row.table_name, { names: row.names, order: row.ord, times: row.times }]));
}

// Every stored file (picture and thumbnail) with a short-lived link; a missing file stops the backup.
async function pictureFiles(media: BackupRow[]): Promise<{ files: BackupPictureFile[] } | { error: string }> {
  const wanted = media.flatMap((row) => [
    { path: String(row.storage_path), bytes: typeof row.byte_size === "number" ? row.byte_size : null, name: String(row.original_name) },
    { path: String(row.thumb_path), bytes: null, name: String(row.original_name) },
  ]);
  const urls = new Map<string, string>();
  for (let start = 0; start < wanted.length; start += SIGN_BATCH) {
    const batch = await getSignedUrls(wanted.slice(start, start + SIGN_BATCH).map((file) => file.path), LINK_SECONDS);
    for (const [path, url] of batch) urls.set(path, url);
  }
  const missing = [...new Set(wanted.filter((file) => !urls.has(file.path)).map((file) => file.name))];
  if (missing.length > 0) {
    return { error: `${countOf(missing.length, "picture")} can't be found in storage (${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}). Replace or delete ${missing.length === 1 ? "it" : "them"} in Media, then try again.` };
  }
  return { files: wanted.map((file) => ({ zipPath: `${PICTURES_FOLDER}/${file.path}`, name: file.name, bytes: file.bytes, url: urls.get(file.path) as string })) };
}

// The counts in the log entry (backup and restore).
export function backupSummary(tables: BackupManifest["tables"]): string {
  return backupCounts((table) => tables[table]?.rows ?? 0)
    .map(({ label, count }) => `${label}: ${count}`)
    .join(" · ");
}
