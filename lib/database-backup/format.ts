// Database backups: the file's shape and the limits. Shared by the app and, by the same values, scripts/restore-database.mjs.
export const DATABASE_BACKUP_FORMAT = "ycc-database-backup";
export const DATABASE_BACKUP_VERSION = 1;

export type DatabaseBackupKind = "daily" | "weekly" | "manual";

export const DATABASE_BACKUP_KIND_LABELS: Record<DatabaseBackupKind, string> = {
  daily: "Daily",
  weekly: "Weekly",
  manual: "Manual",
};

// Copies kept: the newest 7 automatic ones (daily or weekly), the newest 4 weekly ones and the newest 5 manual ones.
export const KEEP_AUTOMATIC = 7;
export const KEEP_WEEKLY = 4;
export const KEEP_MANUAL = 5;
// The schedule makes at most one backup in this time, however often it calls.
export const AUTOMATIC_MIN_HOURS = 20;
// Back Up Now: at most this many in 24 hours.
export const MANUAL_PER_DAY = 10;
// The Backup tab warns when the newest automatic backup is older than this.
export const AUTOMATIC_STALE_HOURS = 36;
// Download links last this long (the browser starts the download straight away).
export const DOWNLOAD_LINK_SECONDS = 60;

// The file: every table's rows as JSON, plus what restore needs to check first.
export type DatabaseBackupFile = {
  format: typeof DATABASE_BACKUP_FORMAT;
  version: typeof DATABASE_BACKUP_VERSION;
  migration: string;
  createdAt: string;
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
};

export type DatabaseBackupRow = {
  id: string;
  kind: DatabaseBackupKind;
  file_path: string;
  byte_size: number;
  migration: string;
  created_at: Date;
  created_by_email: string | null;
};

// "database/2026-11-06-0130-daily-1a2b3c4d.json.gz" → "ycc-database-2026-11-06-0130-daily.json.gz"
export function downloadName(row: Pick<DatabaseBackupRow, "file_path">): string {
  const stamp = /(\d{4}-\d\d-\d\d-\d{4}-[a-z]+)/.exec(row.file_path)?.[1] ?? "backup";
  return `ycc-database-${stamp}.json.gz`;
}
