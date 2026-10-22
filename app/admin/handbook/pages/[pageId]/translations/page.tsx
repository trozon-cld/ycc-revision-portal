import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { pool } from "@/lib/db/pool";
import { collectMediaIds, parseBlocks } from "@/lib/content/blocks";
import type { ResolvedMedia } from "@/lib/content/book";
import { getChapterContext, resolveMedia } from "@/lib/content/pages";
import { isUuid } from "@/lib/ids";
import { firstParam } from "@/lib/params";
import { loadVoiceLanguages } from "@/lib/voice/language-store";
import { translatedLanguages } from "@/lib/voice/languages";
import { loadTranslationBlocks, loadTranslationSummaries } from "@/lib/voice/page-translations";
import { TranslationsEditor } from "./translations-editor";

export const metadata: Metadata = { title: "Translations" };

export default async function TranslationsPage({ params, searchParams }: PageProps<"/admin/handbook/pages/[pageId]/translations">) {
  await requireRole(CONTENT_EDITORS);
  const { pageId } = await params;
  if (!isUuid(pageId)) notFound();
  const query = await searchParams;
  const asked = firstParam(query.lang);
  const languages = await loadVoiceLanguages();
  const translated = translatedLanguages(languages);
  const language = translated.find((item) => item.code === asked) ?? translated[0];
  if (!language) notFound();

  const { rows } = await pool.query<{ id: string; chapter_id: string; title: string; blocks: unknown; content_version: number }>(
    `select id, chapter_id, title, blocks, content_version from content_pages where id = $1`,
    [pageId]
  );
  const page = rows[0];
  if (!page) notFound();
  const chapter = await getChapterContext(page.chapter_id);
  if (!chapter) notFound();
  const parsed = parseBlocks(page.blocks);
  const english = parsed.ok ? parsed.blocks : [];

  const [summaries, current] = await Promise.all([loadTranslationSummaries(page.id), loadTranslationBlocks(page.id, language.code)]);
  let media: ResolvedMedia = {};
  try {
    media = await resolveMedia(collectMediaIds(english));
  } catch (error) {
    console.error("Translations: pictures could not be loaded", error);
  }

  return (
    <TranslationsEditor
      key={`${language.code}:${current?.summary.revision ?? 0}:${page.content_version}`}
      pageId={page.id}
      pageTitle={page.title}
      pageVersion={page.content_version}
      chapter={chapter}
      english={english}
      language={language.code}
      languages={languages}
      summaries={summaries}
      current={current}
      media={media}
    />
  );
}
