import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { PageHeader } from "@/components/admin/page-header";
import { UploadCheck } from "./upload-check";

export const metadata: Metadata = { title: "Upload content" };

export default async function UploadContentPage() {
  await requireRole(CONTENT_EDITORS);
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/admin/handbook" className="text-primary underline underline-offset-2 hover:text-ink">
          Handbook
        </Link>
        <span aria-hidden="true" className="mx-1.5 text-slate-500">/</span>
        <span aria-current="page" className="text-slate-700">Upload content</span>
      </nav>
      <PageHeader
        title="Upload content"
        description="Check a batch of pages, questions and pictures (a zip with content.json and a pictures folder) before it's imported."
      />
      <UploadCheck />
    </>
  );
}
