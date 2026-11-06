import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guard";
import { PageHeader } from "@/components/admin/page-header";
import { PageTabs } from "@/components/admin/page-tabs";
import { BACKUP_ROLES, RESTORE_PATH, backupTabs } from "@/lib/content/backup/access";
import { RestoreAudio } from "./restore-audio";
import { RestoreFiles } from "./restore-files";
import { RestoreBackup } from "./restore-backup";
import { DatabaseStatus } from "@/components/admin/database-status";
import { loadSchemaStatus } from "@/lib/db/schema-version";

export const metadata: Metadata = { title: "Restore" };

export default async function RestorePage() {
  const session = await requireRole(BACKUP_ROLES);
  const schema = await loadSchemaStatus();
  return (
    <>
      <PageHeader title="Backup & Restore" description="Put a content or audio backup back into an empty project, for example when moving to a new one." />
      <PageTabs label="Backup & Restore" tabs={backupTabs(session.role)} current={RESTORE_PATH} />
      <DatabaseStatus status={schema} />
      <p className="mb-4 max-w-3xl text-sm text-slate-600">
        Database backups (from the Backup tab) aren&apos;t restored here: if the database is lost, the site can&apos;t run, so a developer loads the backup into
        a fresh database by the steps in <code>docs/database-backups.md</code>. Then put the pictures and audio back with Put back missing files, below.
      </p>
      <div className="space-y-6">
        <RestoreBackup />
        <RestoreAudio />
        <RestoreFiles />
      </div>
    </>
  );
}
