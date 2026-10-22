import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { requireRole } from "@/lib/auth/guard";
import { loadLanguagePhrases } from "@/lib/voice/language-admin";
import { PhrasesEditor } from "./phrases-editor";

export const metadata: Metadata = { title: "Spoken phrases" };

export default async function LanguagePhrasesPage({ params }: PageProps<"/admin/handbook/languages/manage/[code]">) {
  await requireRole(CONTENT_EDITORS);
  const { code } = await params;
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(code)) notFound();
  const view = await loadLanguagePhrases(code);
  if (!view) notFound();
  // A fresh editor whenever the stored phrases or the status change (after a save, check or draft).
  const key = JSON.stringify([view.language.status, view.phrases]);
  return <PhrasesEditor key={key} view={view} />;
}
