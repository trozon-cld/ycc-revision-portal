import type { PoolClient } from "pg";
import type { SessionPayload } from "@/lib/auth/jwt";
import { logActivity } from "@/lib/audit/log";
import { formatUkDateTime } from "@/lib/candidates/access";
import { parseBlocks } from "@/lib/content/blocks";
import { pool } from "@/lib/db/pool";
import { quoteIdent as quote } from "@/lib/db/identifiers";
import { withTransaction } from "@/lib/db/transaction";
import { countOf } from "@/lib/format";
import { lockHandbookOrder } from "@/lib/handbook/structure";
import { NOT_CONFIGURED } from "@/lib/media/upload";
import { parseQuestion } from "@/lib/questions/validate";
import { EXTENSION_BY_MIME, readImageInfo } from "@/lib/media/image-info";
import { MAX_UPLOAD_BYTES, STORAGE_LIMIT_BYTES } from "@/lib/media/limits";
import { getSignedUrls, isStorageConfigured, storeObject } from "@/lib/storage/storage";
import { storedBytes } from "@/lib/storage/usage";
import { isRecord } from "@/lib/text";
import { backupSummary } from "./export";
import { BACKUP_FORMAT, BACKUP_PARTS, BACKUP_VERSION, type BackupManifest, type BackupPart, type BackupRow, type BackupTable } from "./format";

// Server-only: putting a backup into an empty project, all in one transaction (pictures are uploaded first).

export type RestoreCheck = { ok: true } | { ok: false; problems: string[] };
export type RestoreResult = { ok: true; tables: Record<string, number> } | { ok: false; problems: string[] };
type Parts = Record<BackupPart, Record<string, BackupRow[]>>;

// Dependencies first: pictures before the test types that use them as covers, structure before content.
const RESTORE_ORDER: BackupTable[] = [
  "voice_languages",
  "voice_phrases",
  "media",
  "test_areas",
  "sections",
  "chapters",
  "test_types",
  "test_type_chapters",
  "test_type_languages",
  "content_pages",
  "content_page_media",
  "questions",
  "question_media",
  "handbook_items",
  "page_translations",
  "question_translations",
];
const LANGUAGE_TABLES: readonly BackupTable[] = BACKUP_PARTS.languages;
// Replaced by the backup's (same ids kept); links between them are rebuilt from the backup.
const STRUCTURE_ROWS = [
  { table: "test_areas", name: "name" },
  { table: "sections", name: "title" },
  { table: "chapters", name: "title" },
  { table: "test_types", name: "name" },
] as const;
const STRUCTURE_LINKS: readonly BackupTable[] = ["test_type_chapters", "test_type_languages"];
const SIGN_BATCH = 200;
const LIST_MAX = 5;

// Before any picture is uploaded: the file's shape, this project is empty, nothing would be left pointing nowhere.
export async function checkRestore(manifest: unknown, testTypeIds: unknown, pictureBytes: unknown): Promise<RestoreCheck> {
  if (!isStorageConfigured()) return { ok: false, problems: [NOT_CONFIGURED] };
  const problems = manifestProblems(manifest);
  if (problems.length > 0) return { ok: false, problems };
  const ids = Array.isArray(testTypeIds) ? testTypeIds.filter((id): id is string => typeof id === "string") : [];
  const client = await pool.connect();
  try {
    problems.push(...(await emptyProblems(client)), ...(await columnProblems(client, manifest as BackupManifest)), ...(await candidateProblems(client, ids)));
  } finally {
    client.release();
  }
  const bytes = typeof pictureBytes === "number" && pictureBytes > 0 ? pictureBytes : 0;
  if ((await storedBytes()) + bytes > STORAGE_LIMIT_BYTES) problems.push("There isn't enough picture storage left for this backup's pictures.");
  return problems.length > 0 ? { ok: false, problems } : { ok: true };
}

export async function restoreBackup(session: SessionPayload, raw: unknown): Promise<RestoreResult> {
  if (!isRecord(raw) || !isRecord(raw.parts)) return { ok: false, problems: ["This isn't a backup file."] };
  const manifest = raw.manifest;
  const shape = manifestProblems(manifest);
  if (shape.length > 0) return { ok: false, problems: shape };
  const m = manifest as BackupManifest;
  const parts = readParts(raw.parts, m);
  if ("problems" in parts) return { ok: false, problems: parts.problems };
  const contentProblems = rowProblems(parts.rows);
  if (contentProblems.length > 0) return { ok: false, problems: contentProblems };
  const missing = await missingPictures(parts.rows.content.media ?? []);
  if (missing.length > 0) {
    const one = missing.length === 1;
    return { ok: false, problems: [`${countOf(missing.length, "picture")} ${one ? "hasn't" : "haven't"} been uploaded yet (${missing.slice(0, LIST_MAX).join(", ")}). Restore again to upload ${one ? "it" : "them"}.`] };
  }

  return withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext('content:import'))");
    await lockHandbookOrder(client);
    const testTypeIds = (parts.rows.structure.test_types ?? []).map((row) => String(row.id));
    const problems = [...(await emptyProblems(client)), ...(await columnProblems(client, m)), ...(await candidateProblems(client, testTypeIds))];
    if (problems.length > 0) return { ok: false, problems };

    const rows = Object.assign({}, ...Object.values(parts.rows)) as Record<string, BackupRow[]>;
    await clearStructure(client, rows);
    for (const table of RESTORE_ORDER) {
      const tableRows = rows[table] ?? [];
      if (tableRows.length === 0) continue;
      const columns = m.tables[table].columns;
      const conflict = LANGUAGE_TABLES.includes(table) || STRUCTURE_ROWS.some((entry) => entry.table === table) ? await keyOf(client, table) : null;
      await insertRows(client, table, columns, tableRows, conflict);
    }
    await finishStructure(client, rows);
    // New questions carry on after the highest restored Q number.
    await client.query(`select setval(pg_get_serial_sequence('questions', 'ref_no'), coalesce((select max(ref_no) from questions), 0) + 1, false)`);

    const tables = Object.fromEntries(Object.keys(m.tables).map((table) => [table, (rows[table] ?? []).length]));
    const made = `From the backup made ${formatUkDateTime(m.createdAt)} by ${m.createdBy}`;
    const counts = Object.fromEntries(Object.entries(tables).map(([table, count]) => [table, { columns: [], rows: count }]));
    await logActivity(client, session, "content.backup_restored", { type: "backup", id: null, label: "Restored backup" }, { items: backupSummary(counts), source: made });
    return { ok: true, tables };
  });
}

// A stored picture file a backup holds, put back at its own path. Only while the project has no pictures, and only
// real pictures (checked by content) at a path shaped like the portal's own.
const PICTURE_PATH = /^media\/[A-Za-z0-9][A-Za-z0-9-]{0,79}\.(png|jpg|webp)$/;

export async function restorePicture(path: string, bytes: Uint8Array): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isStorageConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const info = readImageInfo(bytes);
  if (!PICTURE_PATH.test(path) || !info || !path.endsWith(`.${EXTENSION_BY_MIME[info.mime]}`) || bytes.length > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `The backup is damaged (${path.slice(0, 100)} isn't a picture the portal saved).` };
  }
  const { rows } = await pool.query<{ pictures: number }>(`select count(*)::int as pictures from media`);
  if (rows[0].pictures > 0) return { ok: false, error: "This project already has pictures. Restore only works on an empty project." };
  await storeObject(path, new Blob([bytes as BlobPart], { type: info.mime }), info.mime, { restore: true });
  return { ok: true };
}

function manifestProblems(manifest: unknown): string[] {
  if (!isRecord(manifest) || manifest.format !== BACKUP_FORMAT) return ["This isn't a backup file (manifest.json is missing or not a portal backup)."];
  if (manifest.version !== BACKUP_VERSION) return [`This backup is version ${String(manifest.version)}; this portal restores version ${BACKUP_VERSION}.`];
  if (typeof manifest.createdAt !== "string" || typeof manifest.createdBy !== "string" || !isRecord(manifest.tables)) return ["The backup's manifest is damaged."];
  const tables = manifest.tables;
  for (const table of Object.values(BACKUP_PARTS).flat()) {
    const entry = tables[table];
    if (!isRecord(entry) || !Array.isArray(entry.columns) || !entry.columns.every((c) => typeof c === "string") || typeof entry.rows !== "number") {
      return [`The backup's manifest is damaged (${table}).`];
    }
  }
  return [];
}

function readParts(raw: Record<string, unknown>, manifest: BackupManifest): { rows: Parts } | { problems: string[] } {
  const rows = {} as Parts;
  for (const part of Object.keys(BACKUP_PARTS) as BackupPart[]) {
    const tables = raw[part];
    if (!isRecord(tables)) return { problems: [`The backup is damaged (${part}.json is missing).`] };
    rows[part] = {};
    for (const table of BACKUP_PARTS[part]) {
      const list = tables[table];
      if (!Array.isArray(list) || !list.every(isRecord)) return { problems: [`The backup is damaged (${table}).`] };
      // The manifest was written with the rows, so a different count means the file was changed or cut short.
      if (list.length !== manifest.tables[table].rows) return { problems: [`The backup is damaged (${table}: ${list.length} rows, the manifest says ${manifest.tables[table].rows}).`] };
      rows[part][table] = list as BackupRow[];
    }
  }
  return { rows };
}

// Every page and question through the portal's own rules, as the editors save them.
function rowProblems(parts: Parts): string[] {
  const problems: string[] = [];
  for (const row of parts.content.questions ?? []) {
    const result = parseQuestion({ type: row.type, stemText: row.stem_text, stemMediaId: row.stem_media_id, content: row.content, answer: row.answer, explanation: row.explanation });
    if (!result.ok) problems.push(`Question Q${String(row.ref_no).padStart(4, "0")}: ${result.error}`);
  }
  for (const row of parts.content.content_pages ?? []) {
    const result = parseBlocks(row.blocks);
    if (!result.ok) problems.push(`Page "${String(row.title)}": ${result.error}`);
  }
  return problems.length > 0 ? ["The backup has content the portal can't accept:", ...problems.slice(0, 10)] : [];
}

async function emptyProblems(client: PoolClient): Promise<string[]> {
  const { rows } = await client.query<{ pages: number; questions: number; pictures: number }>(
    `select (select count(*) from content_pages)::int as pages, (select count(*) from questions)::int as questions, (select count(*) from media)::int as pictures`
  );
  const { pages, questions, pictures } = rows[0];
  if (pages + questions + pictures === 0) return [];
  const has = [countOf(pages, "page"), countOf(questions, "question"), countOf(pictures, "picture")].join(", ");
  return [`This project already has ${has}. Restore only works on an empty project, so nothing is overwritten.`];
}

// The file's columns must exist here, and any column here the file doesn't have must be allowed to be empty.
async function columnProblems(client: PoolClient, manifest: BackupManifest): Promise<string[]> {
  const { rows } = await client.query<{ table_name: string; name: string; required: boolean }>(
    `select c.relname as table_name, a.attname as name, (a.attnotnull and not a.atthasdef and a.attidentity = '') as required
     from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid
     where n.nspname = 'public' and c.relname = any ($1::text[]) and a.attnum > 0 and not a.attisdropped`,
    [Object.values(BACKUP_PARTS).flat()]
  );
  const problems: string[] = [];
  for (const table of Object.values(BACKUP_PARTS).flat()) {
    const here = rows.filter((row) => row.table_name === table);
    const fromFile = manifest.tables[table].columns;
    const unknown = fromFile.filter((column) => !here.some((row) => row.name === column));
    const needed = here.filter((row) => row.required && !fromFile.includes(row.name)).map((row) => row.name);
    if (unknown.length > 0 || needed.length > 0) problems.push(`The backup doesn't match this portal's version (${table}).`);
  }
  return problems;
}

// Candidate accounts must keep a test type: one the backup doesn't have would leave them without.
async function candidateProblems(client: PoolClient, testTypeIds: string[]): Promise<string[]> {
  const { rows } = await client.query<{ email: string }>(
    `select email from users
     where role = 'candidate' and (test_type_id <> all ($1::uuid[]) or current_test_type_id <> all ($1::uuid[]))
     order by email`,
    [testTypeIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id))]
  );
  if (rows.length === 0) return [];
  const names = rows.slice(0, LIST_MAX).map((row) => row.email).join(", ");
  return [`${countOf(rows.length, "candidate account")} ${rows.length === 1 ? "uses" : "use"} a test type that isn't in this backup (${names}${rows.length > LIST_MAX ? ", …" : ""}). Change their test type or delete them first.`];
}

async function missingPictures(media: BackupRow[]): Promise<string[]> {
  const wanted = media.flatMap((row) => [String(row.storage_path), String(row.thumb_path)]);
  const found = new Set<string>();
  for (let start = 0; start < wanted.length; start += SIGN_BATCH) {
    for (const path of (await getSignedUrls(wanted.slice(start, start + SIGN_BATCH), 60)).keys()) found.add(path);
  }
  return [...new Set(media.filter((row) => !found.has(String(row.storage_path)) || !found.has(String(row.thumb_path))).map((row) => String(row.original_name)))];
}

// Before: links go (rebuilt from the backup), every structure row gets a temporary name so the backup's names
// can't clash while they're put back (names are unique), and test types and chapters not in the backup go.
async function clearStructure(client: PoolClient, rows: Record<string, BackupRow[]>) {
  for (const table of STRUCTURE_LINKS) await client.query(`delete from ${quote(table)}`);
  for (const { table, name } of STRUCTURE_ROWS) await client.query(`update ${quote(table)} set ${quote(name)} = 'restoring ' || id`);
  for (const table of ["test_types", "chapters"]) await deleteOthers(client, table, rows);
}

// After: test areas and sections not in the backup, once nothing points at them.
async function finishStructure(client: PoolClient, rows: Record<string, BackupRow[]>) {
  for (const table of ["sections", "test_areas"]) await deleteOthers(client, table, rows);
}

async function deleteOthers(client: PoolClient, table: string, rows: Record<string, BackupRow[]>) {
  await client.query(`delete from ${quote(table)} where id <> all ($1::uuid[])`, [(rows[table] ?? []).map((row) => String(row.id))]);
}

async function keyOf(client: PoolClient, table: string): Promise<string[]> {
  const { rows } = await client.query<{ name: string }>(
    `select a.attname as name from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
     where i.indrelid = $1::regclass and i.indisprimary order by array_position(i.indkey::int2[], a.attnum)`,
    [table]
  );
  return rows.map((row) => row.name);
}

// Rows as stored, typed by the table itself; on a key clash (languages, structure) the backup's values win.
async function insertRows(client: PoolClient, table: string, columns: string[], rows: BackupRow[], conflict: string[] | null) {
  const list = columns.map(quote).join(", ");
  const onConflict = conflict
    ? ` on conflict (${conflict.map(quote).join(", ")}) do update set ${columns.filter((c) => !conflict.includes(c)).map((c) => `${quote(c)} = excluded.${quote(c)}`).join(", ")}`
    : "";
  await client.query(
    `insert into ${quote(table)} (${list}) overriding system value
     select ${list} from jsonb_populate_recordset(null::${quote(table)}, $1::jsonb)${onConflict}`,
    [JSON.stringify(rows)]
  );
}
