import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { formatUkDateTime } from "@/lib/candidates/access";
import { formatBytes } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { PageTabs } from "@/components/admin/page-tabs";
import { BACKUP_PATH, BACKUP_ROLES, backupTabs } from "@/lib/content/backup/access";
import { listAudioLanguages } from "@/lib/content/backup/audio";
import { AudioBackups } from "./audio-backups";
import { BackupDownload } from "./backup-download";
import { DatabaseBackups } from "./database-backups";
import { DATABASE_BACKUP_KIND_LABELS } from "@/lib/database-backup/format";
import { listDatabaseBackups } from "@/lib/database-backup/list";
import { DatabaseStatus } from "@/components/admin/database-status";
import { loadSchemaStatus } from "@/lib/db/schema-version";

export const metadata: Metadata = { title: "Backup" };

export default async function BackupPage() {
  const session = await requireRole(BACKUP_ROLES);
  const schema = await loadSchemaStatus();
  const [{ rows }, audio, database] = await Promise.all([
    pool.query<{ created_at: Date; actor_email: string }>(
      `select created_at, actor_email from activity_logs where action = 'content.backup_downloaded' order by created_at desc limit 1`
    ),
    listAudioLanguages(),
    listDatabaseBackups(),
  ]);
  const newestDatabase = database.backups[0];
  const last = rows[0];
  return (
    <>
      <PageHeader
        title="Backup & Restore"
        description={[
          newestDatabase ? `Last database backup: ${formatUkDateTime(newestDatabase.created_at)}` : "No database backup yet",
          last ? `Last content backup: ${formatUkDateTime(last.created_at)} by ${last.actor_email}` : "No content backup yet",
        ].join(" · ")}
      />
      <PageTabs label="Backup & Restore" tabs={backupTabs(session.role)} current={BACKUP_PATH} />
      <DatabaseStatus status={schema} />
      <div className="space-y-6">
        <DatabaseBackups
          backups={database.backups.map((backup) => ({
            id: backup.id,
            kind: DATABASE_BACKUP_KIND_LABELS[backup.kind],
            manual: backup.kind === "manual",
            when: formatUkDateTime(backup.created_at),
            size: formatBytes(backup.byte_size),
            migration: backup.migration.slice(0, 4),
            by: backup.kind === "manual" ? backup.created_by_email ?? "a deleted account" : null,
          }))}
          scheduleSetUp={database.scheduleSetUp}
          automaticStale={database.automaticStale}
        />
        <BackupDownload />
        <AudioBackups languages={audio} />
      </div>
    </>
  );
}
