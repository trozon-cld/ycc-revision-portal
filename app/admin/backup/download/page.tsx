import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { formatUkDateTime } from "@/lib/candidates/access";
import { PageHeader } from "@/components/admin/page-header";
import { PageTabs } from "@/components/admin/page-tabs";
import { BACKUP_PATH, BACKUP_ROLES, backupTabs } from "@/lib/content/backup/access";
import { BackupDownload } from "./backup-download";

export const metadata: Metadata = { title: "Backup" };

export default async function BackupPage() {
  const session = await requireRole(BACKUP_ROLES);
  const { rows } = await pool.query<{ created_at: Date; actor_email: string }>(
    `select created_at, actor_email from activity_logs where action = 'content.backup_downloaded' order by created_at desc limit 1`
  );
  const last = rows[0];
  return (
    <>
      <PageHeader
        title="Backup & Restore"
        description={last ? `Last backup: ${formatUkDateTime(last.created_at)} by ${last.actor_email}` : "No backup has been made yet."}
      />
      <PageTabs label="Backup & Restore" tabs={backupTabs(session.role)} current={BACKUP_PATH} />
      <BackupDownload />
    </>
  );
}
