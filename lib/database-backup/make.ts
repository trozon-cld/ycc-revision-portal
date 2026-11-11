import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import type { SessionPayload } from "@/lib/auth/jwt";
import { logActivity, SYSTEM_ACTOR, SYSTEM_ACTOR_ID } from "@/lib/audit/log";
import { ACCESS_TIME_ZONE } from "@/lib/candidates/access";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { formatBytes } from "@/lib/format";
import { STORAGE_LIMIT_BYTES } from "@/lib/hosting";
import { deleteObjects, isStorageConfigured, StorageConfigError, storeObject } from "@/lib/storage/storage";
import { storedBytes } from "@/lib/storage/usage";
import {
  AUTOMATIC_MIN_HOURS,
  DATABASE_BACKUP_FORMAT,
  DATABASE_BACKUP_VERSION,
  KEEP_AUTOMATIC,
  KEEP_MANUAL,
  KEEP_WEEKLY,
  MANUAL_PER_DAY,
  DATABASE_BACKUP_KIND_LABELS,
  type DatabaseBackupKind,
} from "./format";

// Server only: one database backup (every table, read in one consistent snapshot) saved to the private backups bucket.
export type MadeBackup =
  | { ok: true; id: string; kind: DatabaseBackupKind; bytes: number }
  | { ok: false; skipped?: true; error: string };

// One backup at a time across every copy of the site (a Postgres advisory lock, released when the run ends).
const BACKUP_LOCK = 440_044;

export async function makeDatabaseBackup(by: { schedule: true } | { session: SessionPayload }): Promise<MadeBackup> {
  if (!isStorageConfigured()) return { ok: false, error: "Storage isn't set up, so a database backup can't be saved." };
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query<{ ok: boolean }>(`select pg_try_advisory_lock($1) as ok`, [BACKUP_LOCK])).rows[0].ok;
    if (!locked) return { ok: false, skipped: true, error: "A database backup is already being made. Try again in a minute." };

    const refused = "schedule" in by ? await scheduleRefusal(client) : await manualRefusal(client);
    if (refused) return refused;

    const dump = await readDatabase(client);
    const body = gzipSync(dump.json);
    if ((await storedBytes()) + body.length > STORAGE_LIMIT_BYTES) {
      return { ok: false, error: `Storage is full, so the database backup (${formatBytes(body.length)}) couldn't be saved. Delete pictures in Media or audio you no longer need.` };
    }

    const kind: DatabaseBackupKind = "schedule" in by ? await automaticKind(client) : "manual";
    const id = randomUUID();
    const filePath = `database/${dump.stamp}-${kind}-${id.slice(0, 8)}.json.gz`;
    await storeObject(filePath, new Blob([body]), "application/gzip", { area: "backups" });
    try {
      await withTransaction(async (tx) => {
        await tx.query(
          `insert into database_backups (id, kind, file_path, byte_size, migration, created_by) values ($1, $2, $3, $4, $5, $6)`,
          [id, kind, filePath, body.length, dump.migration, "session" in by ? by.session.sub : null]
        );
        await logActivity(tx, "session" in by ? by.session : SYSTEM_ACTOR, "database.backup_created", { type: "backup", id, label: filePath.slice("database/".length) }, {
          result: `${DATABASE_BACKUP_KIND_LABELS[kind]} · ${formatBytes(body.length)}`,
        });
      });
    } catch (error) {
      await deleteObjects([filePath], "backups").catch(() => undefined);
      throw error;
    }
    await removeOldCopies(client);
    return { ok: true, id, kind, bytes: body.length };
  } catch (error) {
    if (error instanceof StorageConfigError) return { ok: false, error: `${error.message} Create it as a private bucket, then try again.` };
    console.error("Database backup failed:", error);
    return { ok: false, error: "The database backup couldn't be made. Nothing was saved. Please try again." };
  } finally {
    if (locked) await client.query(`select pg_advisory_unlock($1)`, [BACKUP_LOCK]).catch(() => undefined);
    client.release();
  }
}

async function scheduleRefusal(client: PoolClient): Promise<MadeBackup | null> {
  const { rows } = await client.query(
    `select 1 from database_backups where kind <> 'manual' and created_at > now() - make_interval(hours => $1) limit 1`,
    [AUTOMATIC_MIN_HOURS]
  );
  return rows.length ? { ok: false, skipped: true, error: `An automatic backup was made in the last ${AUTOMATIC_MIN_HOURS} hours.` } : null;
}

// Counted from the activity log, which keeps every one (older copies are removed from the list).
async function manualRefusal(client: PoolClient): Promise<MadeBackup | null> {
  const { rows } = await client.query<{ n: number }>(
    `select count(*)::int as n from activity_logs
     where action = 'database.backup_created' and actor_id <> $1 and created_at > now() - interval '24 hours'`,
    [SYSTEM_ACTOR_ID]
  );
  return rows[0].n >= MANUAL_PER_DAY ? { ok: false, error: `Up to ${MANUAL_PER_DAY} backups can be made by hand in 24 hours. The daily backup still runs.` } : null;
}

// The first automatic backup in each UK week is the weekly one.
async function automaticKind(client: PoolClient): Promise<DatabaseBackupKind> {
  const { rows } = await client.query(
    `select 1 from database_backups
     where kind = 'weekly' and date_trunc('week', created_at at time zone $1) = date_trunc('week', now() at time zone $1) limit 1`,
    [ACCESS_TIME_ZONE]
  );
  return rows.length ? "daily" : "weekly";
}

// Every table in one read-only snapshot, so the copy is consistent; Postgres writes each table's JSON itself.
async function readDatabase(client: PoolClient): Promise<{ json: string; migration: string; stamp: string }> {
  await client.query("begin isolation level repeatable read read only");
  try {
    const { rows: tables } = await client.query<{ name: string }>(
      `select table_name as name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`
    );
    const { rows: info } = await client.query<{ migration: string; created_at: string; stamp: string }>(
      `select (select max(name) from schema_migrations) as migration,
              to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
              to_char(now() at time zone $1, 'YYYY-MM-DD-HH24MI') as stamp`,
      [ACCESS_TIME_ZONE]
    );
    const counts: Record<string, number> = {};
    const parts: string[] = [];
    for (const { name } of tables) {
      const quoted = `"${name.replace(/"/g, '""')}"`;
      const { rows } = await client.query<{ rows: string; n: number }>(`select coalesce(json_agg(t), '[]')::text as rows, count(*)::int as n from ${quoted} t`);
      counts[name] = rows[0].n;
      parts.push(`${JSON.stringify(name)}:${rows[0].rows}`);
    }
    await client.query("commit");
    const head = { format: DATABASE_BACKUP_FORMAT, version: DATABASE_BACKUP_VERSION, migration: info[0].migration, createdAt: info[0].created_at, counts };
    return { json: `${JSON.stringify(head).slice(0, -1)},"tables":{${parts.join(",")}}}`, migration: info[0].migration, stamp: info[0].stamp };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

// Files first, then their rows: a failed delete leaves both, to be tried again after the next backup.
async function removeOldCopies(client: PoolClient) {
  try {
    const { rows } = await client.query<{ id: string; file_path: string }>(
      `select id, file_path from database_backups b
       where (kind = 'manual' and id not in (select id from database_backups where kind = 'manual' order by created_at desc limit $3))
          or (kind <> 'manual'
              and id not in (select id from database_backups where kind <> 'manual' order by created_at desc limit $1)
              and id not in (select id from database_backups where kind = 'weekly' order by created_at desc limit $2))`,
      [KEEP_AUTOMATIC, KEEP_WEEKLY, KEEP_MANUAL]
    );
    if (rows.length === 0) return;
    await deleteObjects(rows.map((row) => row.file_path), "backups");
    await client.query(`delete from database_backups where id = any($1::uuid[])`, [rows.map((row) => row.id)]);
  } catch (error) {
    console.error("Removing old database backups failed (tried again after the next backup):", error);
  }
}
