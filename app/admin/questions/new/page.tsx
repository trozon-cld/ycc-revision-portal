import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth/guard";
import { listChapterOptions } from "@/lib/questions/queries";
import { getQuestionTypeDef } from "@/lib/questions/registry";
import { isQuestionType } from "@/lib/questions/types";
import { emptySingleText } from "@/lib/questions/types/single-text";
import { isUuid } from "@/lib/questions/validate";
import { isStorageConfigured } from "@/lib/storage/storage";
import { QuestionEditor } from "../question-editor";

export default async function NewQuestionPage({ searchParams }: PageProps<"/admin/questions/new">) {
  await requireRole(["superadmin"]);
  const params = await searchParams;
  const type = one(params.type);
  if (!isQuestionType(type) || !getQuestionTypeDef(type)) notFound();

  const chapters = await listChapterOptions();
  const chapterParam = one(params.chapter);
  const known = chapters.some((section) => section.chapters.some((chapter) => chapter.id === chapterParam));
  // Ids are made here, not in the browser, so the server and browser render the same options.
  const empty = emptySingleText(randomUUID);

  return (
    <QuestionEditor
      questionId={null}
      refLabel={null}
      type={type}
      initial={{
        chapterId: known && chapterParam && isUuid(chapterParam) ? chapterParam : "",
        stemText: "",
        stemMediaId: null,
        content: empty.content,
        answer: empty.answer,
        explanation: "",
        inPractice: true,
        inMock: true,
      }}
      initialVersion={null}
      status={null}
      chapters={chapters}
      bookChapter={null}
      initialMedia={{}}
      storageReady={isStorageConfigured()}
      loadProblem={null}
    />
  );
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
