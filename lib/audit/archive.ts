import { gzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import type { SessionPayload } from "@/lib/auth/jwt";
import { ACCESS_TIME_ZONE } from "@/lib/candidates/access";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { getSignedUrls, storeObject } from "@/lib/storage/storage";
import { logActivity } from "./log";

// Old login records: whole months (UK time) older than this are saved to a file, then deleted.
export const ARCHIVE_AFTER_DAYS = 180;
// Months archived per press, so one request stays short; the rest wait for the next press.
const MONTHS_PER_RUN = 12;
const DOWNLOAD_LINK_SECONDS = 60 * 60;
const ZONE = ACCESS_TIME_ZONE;

// Start of the first month that isn't old enough yet, as an instant.
const CUTOFF = `(date_trunc('month', (now() - interval '${ARCHIVE_AFTER_DAYS} days') at time zone '${ZONE}') at time zone '${ZONE}')`;
const monthStart = (param: string) => `(${param}::date::timestamp at time zone '${ZONE}')`;
const monthEnd = (param: string) => `((${param}::date + interval '1 month')::timestamp at time zone '${ZONE}')`;

export type ArchiveStatus = {
  waiting: { month: string; count: number }[];
  // The oldest month that isn't old enough yet, and the UK date it will be.
  next: { month: string; from: string } | null;
};

export type LogArchive = {
  id: string;
  month: string;
  recordCount: number;
  byteSize: number;
  archivedByEmail: string;
  createdAt: string;
  downloadUrl: string | null;
};

// "2026-04-01" → "April 2026".
export function archiveMonthText(month: string): string {
  return new Date(`${month}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export async function loadArchiveStatus(): Promise<ArchiveStatus> {
  const [{ rows: waiting }, { rows: next }] = await Promise.all([
    pool.query<{ month: string; count: number }>(
      `select to_char(date_trunc('month', created_at at time zone '${ZONE}'), 'YYYY-MM-DD') as month, count(*)::int as count
       from auth_events where created_at < ${CUTOFF}
       group by 1 order by 1`
    ),
    pool.query<{ month: string; from: string }>(
      `select to_char(m, 'YYYY-MM-DD') as month, to_char(m + interval '1 month' + interval '${ARCHIVE_AFTER_DAYS} days', 'YYYY-MM-DD') as from
       from (select date_trunc('month', min(created_at) at time zone '${ZONE}') as m from auth_events where created_at >= ${CUTOFF}) oldest
       where m is not null`
    ),
  ]);
  return { waiting, next: next[0] ?? null };
}

export async function countArchives(): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(`select count(*)::int as count from log_archives where log = 'login_records'`);
  return rows[0].count;
}

export async function listArchives(offset: number, limit: number): Promise<LogArchive[]> {
  const { rows } = await pool.query<{
    id: string;
    month: string;
    record_count: number;
    byte_size: number;
    archived_by_email: string;
    created_at: string;
    file_path: string;
  }>(
    `select id, to_char(month, 'YYYY-MM-DD') as month, record_count, byte_size, archived_by_email, created_at, file_path
     from log_archives where log = 'login_records'
     order by month desc limit $1 offset $2`,
    [limit, offset]
  );
  const links = rows.length ? await getSignedUrls(rows.map((row) => row.file_path), DOWNLOAD_LINK_SECONDS, "archives").catch(() => new Map<string, string>()) : new Map<string, string>();
  return rows.map((row) => {
    const link = links.get(row.file_path);
    return {
      id: row.id,
      month: row.month,
      recordCount: row.record_count,
      byteSize: row.byte_size,
      archivedByEmail: row.archived_by_email,
      createdAt: row.created_at,
      downloadUrl: link ? `${link}&download=${encodeURIComponent(fileName(row.month))}` : null,
    };
  });
}

const fileName = (month: string) => `login-records-${month.slice(0, 7)}.json.gz`;

export type ArchiveResult = { archived: { month: string; count: number }[]; more: boolean };

// Each month in its own transaction: file saved, archive row written, records deleted, change logged.
// The lock makes a second press wait, then find the month already done.
export async function archiveLoginRecords(actor: SessionPayload): Promise<ArchiveResult> {
  const { waiting } = await loadArchiveStatus();
  const archived: ArchiveResult["archived"] = [];
  for (const { month } of waiting.slice(0, MONTHS_PER_RUN)) {
    const done = await withTransaction((client) => archiveMonth(client, actor, month));
    if (done) archived.push(done);
  }
  return { archived, more: waiting.length > MONTHS_PER_RUN };
}

async function archiveMonth(client: PoolClient, actor: SessionPayload, month: string) {
  await client.query(`select pg_advisory_xact_lock(hashtext('log_archives:login_records'))`);
  const { rows: already } = await client.query(`select 1 from log_archives where log = 'login_records' and month = $1`, [month]);
  if (already[0]) return null;

  const { rows } = await client.query<{ id: string; created_at: Date; event: string; user_id: string | null; email: string; role: string | null; ip_address: string | null }>(
    `select id, created_at, event, user_id, email, role, ip_address from auth_events
     where created_at >= ${monthStart("$1")} and created_at < ${monthEnd("$1")}
     order by created_at, id`,
    [month]
  );
  if (rows.length === 0) return null;

  const file = gzipSync(
    JSON.stringify({
      log: "login_records",
      month: month.slice(0, 7),
      timeZone: ZONE,
      exportedAt: new Date().toISOString(),
      count: rows.length,
      columns: ["id", "created_at", "event", "user_id", "email", "role", "ip_address"],
      rows: rows.map((row) => [row.id, row.created_at.toISOString(), row.event, row.user_id, row.email, row.role, row.ip_address]),
    })
  );
  const path = fileName(month);
  await storeObject(path, new Blob([new Uint8Array(file)]), "application/gzip", { replace: true, area: "archives" });

  const { rows: inserted } = await client.query<{ id: string }>(
    `insert into log_archives (log, month, record_count, file_path, byte_size, archived_by, archived_by_email)
     values ('login_records', $1, $2, $3, $4, $5, coalesce((select email from users where id = $5), $6)) returning id`,
    [month, rows.length, path, file.byteLength, actor.sub, actor.email]
  );
  const deleted = await client.query(`delete from auth_events where created_at >= ${monthStart("$1")} and created_at < ${monthEnd("$1")}`, [month]);
  if (deleted.rowCount !== rows.length) throw new Error(`Archive of ${month}: ${rows.length} saved but ${deleted.rowCount} deleted`);

  await logActivity(
    client,
    actor,
    "log.login_records_archived",
    { type: "log_archive", id: inserted[0].id, label: `Login records, ${archiveMonthText(month)}` },
    { records: rows.length.toLocaleString("en-GB") }
  );
  return { month, count: rows.length };
}
