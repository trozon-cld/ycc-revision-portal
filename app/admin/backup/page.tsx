import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { PageHeader } from "@/components/admin/page-header";
import { PageTabs } from "@/components/admin/page-tabs";
import { UPLOAD_PATH, backupTabs } from "@/lib/content/backup/access";
import { UploadCheck } from "./upload-check";

export const metadata: Metadata = { title: "Upload content" };

export default async function UploadContentPage() {
  const session = await requireRole(CONTENT_EDITORS);
  return (
    <>
      <PageHeader
        title="Backup & Restore"
        description="Check a batch of pages, questions and pictures (a zip with content.json and a pictures folder) before it's imported."
      />
      <PageTabs label="Backup & Restore" tabs={backupTabs(session.role)} current={UPLOAD_PATH} />
      <UploadCheck />
    </>
  );
}
