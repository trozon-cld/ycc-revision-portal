import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guard";
import { PageHeader } from "@/components/admin/page-header";
import { PageTabs } from "@/components/admin/page-tabs";
import { BACKUP_ROLES, RESTORE_PATH, backupTabs } from "@/lib/content/backup/access";
import { RestoreBackup } from "./restore-backup";

export const metadata: Metadata = { title: "Restore" };

export default async function RestorePage() {
  const session = await requireRole(BACKUP_ROLES);
  return (
    <>
      <PageHeader title="Backup & Restore" description="Put a backup back into an empty project, for example when moving to a new one." />
      <PageTabs label="Backup & Restore" tabs={backupTabs(session.role)} current={RESTORE_PATH} />
      <RestoreBackup />
    </>
  );
}
