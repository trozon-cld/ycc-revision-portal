import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { PageHeader } from "@/components/admin/page-header";
import { PageTabs } from "@/components/admin/page-tabs";
import { BACKUP_ROLES, UPLOAD_PATH, backupTabs } from "@/lib/content/backup/access";
import { UploadCheck } from "./upload-check";
import { DatabaseStatus } from "@/components/admin/database-status";
import { loadSchemaStatus } from "@/lib/db/schema-version";

export const metadata: Metadata = { title: "Upload Content" };

export default async function UploadContentPage() {
  const session = await requireRole(CONTENT_EDITORS);
  const schema = BACKUP_ROLES.includes(session.role) ? await loadSchemaStatus() : null;
  return (
    <>
      <PageHeader
        title="Backup & Restore"
        description="Check a batch of pages, questions and pictures (a zip with content.json and a pictures folder) before it's imported."
      />
      <PageTabs label="Backup & Restore" tabs={backupTabs(session.role)} current={UPLOAD_PATH} />
      {schema && <DatabaseStatus status={schema} />}
      <UploadCheck />
    </>
  );
}
