import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import type { ResolvedMedia } from "@/lib/content/book";
import { resolveMedia } from "@/lib/content/pages";
import { chapterNumber } from "@/lib/handbook/structure";
import { questionRef } from "@/lib/questions/labels";
import { listChapterOptions } from "@/lib/questions/queries";
import type { QuestionStatus, QuestionType } from "@/lib/questions/types";
import { editableSingleText } from "@/lib/questions/types/single-text";
import { isUuid, parseQuestion } from "@/lib/questions/validate";
import { isStorageConfigured } from "@/lib/storage/storage";
import { QuestionEditor } from "../question-editor";

export default async function EditQuestionPage({ params }: PageProps<"/admin/questions/[questionId]">) {
  await requireRole(["superadmin"]);
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
    content: unknown;
    answer: unknown;
    explanation: string | null;
    in_practice: boolean;
    in_mock: boolean;
    content_version: number;
    book_chapter: number | null;
  }>(
    `select q.id, q.ref_no, q.chapter_id, q.type, q.status, q.stem_text, q.stem_media_id, q.content, q.answer,
            q.explanation, q.in_practice, q.in_mock, q.content_version,
            (select n.number from handbook_items hi
               join (select c.id, row_number() over (order by s.position, c.position)::int as number
                     from chapters c join sections s on s.id = c.section_id) n on n.id = hi.chapter_id
              where hi.question_id = q.id) as book_chapter
     from questions q where q.id = $1`,
    [questionId]
  );
  const question = rows[0];
  if (!question) notFound();

  const chapters = await listChapterOptions();
  // Saved questions passed the checks on save; if the rules tightened since, say so and keep the data.
  const parsed = parseQuestion({
    type: question.type,
    stemText: question.stem_text,
    stemMediaId: question.stem_media_id,
    content: question.content,
    answer: question.answer,
    explanation: question.explanation,
  });

  // Single answer is the only editable type so far; later types add their own fallback here.
  const editable = parsed.ok
    ? { content: parsed.question.content, answer: parsed.question.answer }
    : editableSingleText(question.content, question.answer, randomUUID);

  let media: ResolvedMedia = {};
  try {
    media = await resolveMedia(question.stem_media_id ? [question.stem_media_id] : []);
  } catch (error) {
    console.error("Question editor: pictures could not be loaded", error);
  }

  return (
    <QuestionEditor
      questionId={question.id}
      refLabel={questionRef(question.ref_no)}
      type={question.type}
      initial={{
        chapterId: question.chapter_id,
        stemText: question.stem_text,
        stemMediaId: question.stem_media_id,
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
    />
  );
}
