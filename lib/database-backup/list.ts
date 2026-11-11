import { pool } from "@/lib/db/pool";
import { AUTOMATIC_STALE_HOURS, type DatabaseBackupRow } from "./format";

// Server only: the stored database backups (at most 16, so no paging) and how fresh the automatic ones are.
export type DatabaseBackupList = {
  backups: DatabaseBackupRow[];
  scheduleSetUp: boolean;
  // The newest automatic backup is older than AUTOMATIC_STALE_HOURS, or there is none.
  automaticStale: boolean;
};

export async function listDatabaseBackups(): Promise<DatabaseBackupList> {
  const { rows } = await pool.query<DatabaseBackupRow>(
    `select b.id, b.kind, b.file_path, b.byte_size, b.migration, b.created_at, u.email as created_by_email
     from database_backups b left join users u on u.id = b.created_by
     order by b.created_at desc`
  );
  const newestAutomatic = rows.find((row) => row.kind !== "manual");
  const staleBefore = Date.now() - AUTOMATIC_STALE_HOURS * 60 * 60 * 1000;
  return {
    backups: rows,
    scheduleSetUp: cronSecret() !== null,
    automaticStale: !newestAutomatic || newestAutomatic.created_at.getTime() < staleBefore,
  };
}

// The schedule's secret: at least 16 characters, or the schedule's link stays closed.
export const MIN_CRON_SECRET_LENGTH = 16;
export function cronSecret(): string | null {
  const secret = process.env.CRON_SECRET?.trim();
  return secret && secret.length >= MIN_CRON_SECRET_LENGTH ? secret : null;
}

export async function findDatabaseBackup(id: string): Promise<DatabaseBackupRow | null> {
  const { rows } = await pool.query<DatabaseBackupRow>(
    `select id, kind, file_path, byte_size, migration, created_at, null as created_by_email from database_backups where id = $1`,
    [id]
  );
  return rows[0] ?? null;
}
