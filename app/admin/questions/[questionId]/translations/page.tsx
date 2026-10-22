import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { isUuid } from "@/lib/ids";
import { firstParam } from "@/lib/params";
import { questionRef } from "@/lib/questions/labels";
import { loadVoiceLanguages } from "@/lib/voice/language-store";
import { translatedLanguages } from "@/lib/voice/languages";
import { loadQuestionTranslations } from "@/lib/voice/question-voice";
import { QuestionTranslationsEditor } from "./question-translations-editor";

export const metadata: Metadata = { title: "Question translations" };

export default async function QuestionTranslationsPage({ params, searchParams }: PageProps<"/admin/questions/[questionId]/translations">) {
  await requireRole(CONTENT_EDITORS);
  const { questionId } = await params;
  if (!isUuid(questionId)) notFound();
  const query = await searchParams;
  const asked = firstParam(query.lang);
  const languages = await loadVoiceLanguages();
  const translated = translatedLanguages(languages);
  const language = translated.find((item) => item.code === asked) ?? translated[0];
  if (!language) notFound();

  const view = await loadQuestionTranslations(questionId, language.code);
  if (!view) notFound();
  const current = view.current;

  return (
    <QuestionTranslationsEditor
      key={`${language.code}:${current?.summary.revision ?? 0}:${current?.summary.sourceVersion ?? 0}:${JSON.stringify(view.english)}`}
      questionId={questionId}
      refLabel={questionRef(view.refNo)}
      english={view.english}
      language={language.code}
      languages={languages}
      summaries={view.voice.translations}
      unavailable={view.voice.unavailable}
      current={current}
    />
  );
}
