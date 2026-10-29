import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { pool } from "@/lib/db/pool";
import type { ResolvedMedia } from "@/lib/content/book";
import { resolveMedia } from "@/lib/content/pages";
import { chapterNumber } from "@/lib/handbook/structure";
import { sourceLabel } from "@/lib/content/import/format";
import { questionRef } from "@/lib/questions/labels";
import { listChapterOptions } from "@/lib/questions/queries";
import type { QuestionStatus, QuestionType } from "@/lib/questions/types";
import { editableDraft } from "@/lib/questions/drafts";
import { parseQuestion } from "@/lib/questions/validate";
import { isStorageConfigured } from "@/lib/storage/storage";
import { isUuid } from "@/lib/ids";
import { loadVoiceLanguages } from "@/lib/voice/language-store";
import { languageNames } from "@/lib/voice/languages";
import { loadQuestionVoice } from "@/lib/voice/question-voice";
import { QuestionEditor } from "../question-editor";

export const metadata: Metadata = { title: "Edit question" };

export default async function EditQuestionPage({ params }: PageProps<"/admin/questions/[questionId]">) {
  await requireRole(CONTENT_EDITORS);
  const { questionId } = await params;
  if (!isUuid(questionId)) notFound();

  const { rows } = await pool.query<{
    id: string;
    ref_no: number;
    chapter_id: string;
    type: QuestionType;
    status: QuestionStatus;
    stem_text: string;
    stem_media_id: string | null;
    stem_media_size: "small" | "medium" | "large" | null;
    stem_media_align: "left" | "right" | null;
    content: unknown;
    answer: unknown;
    explanation: string | null;
    in_practice: boolean;
    in_mock: boolean;
    content_version: number;
    source_key: string | null;
    book_chapter: number | null;
  }>(
    `select q.id, q.ref_no, q.chapter_id, q.type, q.status, q.stem_text, q.stem_media_id, q.stem_media_size,
            q.stem_media_align, q.content, q.answer,
            q.explanation, q.in_practice, q.in_mock, q.content_version, q.source_key,
            (select n.number from handbook_items hi
               join (select c.id, row_number() over (order by s.position, c.position)::int as number
                     from chapters c join sections s on s.id = c.section_id) n on n.id = hi.chapter_id
              where hi.question_id = q.id) as book_chapter
     from questions q where q.id = $1`,
    [questionId]
  );
  const question = rows[0];
  if (!question) notFound();

  const [chapters, voice, languages] = await Promise.all([listChapterOptions(), loadQuestionVoice(question.id), loadVoiceLanguages()]);
  // Saved questions passed the checks on save; if the rules tightened since, say so and keep the data.
  // A draft may still be waiting for its areas (the editor says so itself).
  const parsed = parseQuestion({
    type: question.type,
    stemText: question.stem_text,
    stemMediaId: question.stem_media_id,
    stemMediaSize: question.stem_media_size,
    stemMediaAlign: question.stem_media_align,
    content: question.content,
    answer: question.answer,
    explanation: question.explanation,
  }, { allowUnmarked: question.status !== "published" });

  // Always in the editor's draft shape (e.g. an empty label rather than none), so opening a question
  // never shows it as changed. A question that no longer passes the checks opens with what is usable.
  const source = parsed.ok ? parsed.question : { content: question.content, answer: question.answer };
  const editable = editableDraft(question.type, source.content, source.answer, randomUUID) ?? source;

  let media: ResolvedMedia = {};
  try {
    // Every picture the question uses: its own and any option pictures.
    const { rows: used } = await pool.query<{ media_id: string }>(`select media_id from question_media where question_id = $1`, [
      question.id,
    ]);
    media = await resolveMedia([...new Set([...(question.stem_media_id ? [question.stem_media_id] : []), ...used.map((row) => row.media_id)])]);
  } catch (error) {
    console.error("Question editor: pictures could not be loaded", error);
  }

  return (
    <QuestionEditor
      questionId={question.id}
      refLabel={questionRef(question.ref_no)}
      source={question.source_key ? sourceLabel(question.source_key) : null}
      type={question.type}
      initial={{
        chapterId: question.chapter_id,
        stemText: question.stem_text,
        stemMediaId: question.stem_media_id,
        stemMediaSize: question.stem_media_size ?? "full",
        stemMediaAlign: question.stem_media_align ?? "center",
        content: editable.content,
        answer: editable.answer,
        explanation: question.explanation ?? "",
        inPractice: question.in_practice,
        inMock: question.in_mock,
      }}
      initialVersion={question.content_version}
      status={question.status}
      chapters={chapters}
      bookChapter={question.book_chapter === null ? null : chapterNumber(question.book_chapter)}
      initialMedia={media}
      storageReady={isStorageConfigured()}
      loadProblem={parsed.ok ? null : parsed.error}
      voice={voice}
      languages={languageNames(languages)}
    />
  );
}
