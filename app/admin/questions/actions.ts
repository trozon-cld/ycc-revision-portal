"use server";

import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { questionLogLabel } from "@/lib/questions/labels";
import { readQuestionForUpdate } from "@/lib/questions/queries";
import { questionTypeLabel } from "@/lib/questions/registry";
import { isUuid, parseQuestion, type ParsedQuestion } from "@/lib/questions/validate";

export type QuestionActionState = { error?: string; success?: boolean };
export type QuestionSaveInput = {
  // null for a question that hasn't been saved yet.
  questionId: string | null;
  expectedVersion: number | null;
  chapterId: string;
  type: string;
  stemText: string;
  stemMediaId: string | null;
  content: unknown;
  answer: unknown;
  explanation: string;
  inPractice: boolean;
  inMock: boolean;
};
export type QuestionSaveResult =
  | { ok: true; id: string; version: number }
  | { ok: false; error: string; conflict?: boolean };

const NOT_FOUND = "This question no longer exists.";
const IN_HANDBOOK = "This question is in the Handbook. Remove it from the chapter's page order first.";
const PICTURE_GONE = "A picture in this question was deleted from Media. Choose another picture and save again.";
const CHAPTER_GONE = "That chapter no longer exists. Choose another chapter.";

// Creates the question on its first save, then updates it. Nothing is stored before a valid save.
export async function saveQuestion(input: QuestionSaveInput): Promise<QuestionSaveResult> {
  const session = await requireRole(["superadmin"]);

  const questionId = input?.questionId ?? null;
  if (questionId !== null && (!isUuid(questionId) || !Number.isInteger(input.expectedVersion))) {
    return { ok: false, error: NOT_FOUND };
  }
  if (!isUuid(input?.chapterId)) return { ok: false, error: "Choose a chapter." };
  if (typeof input.inPractice !== "boolean" || typeof input.inMock !== "boolean") {
    return { ok: false, error: "Choose where this question is used." };
  }
  const parsed = parseQuestion(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const question = parsed.question;
  const chapterId = input.chapterId.toLowerCase();

  let result: QuestionSaveResult;
  try {
    result = await withTransaction<QuestionSaveResult>(async (client) => {
      if (questionId === null) {
        const chapter = await lockChapter(client, chapterId);
        if (!chapter) return { ok: false, error: CHAPTER_GONE };
        if (!(await picturesExist(client, question.mediaIds))) return { ok: false, error: PICTURE_GONE };

        const { rows } = await client.query<{ id: string; ref_no: number }>(
          `insert into questions (chapter_id, type, stem_text, stem_media_id, content, answer, explanation, in_practice, in_mock)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, ref_no`,
          [
            chapterId,
            question.type,
            question.stemText,
            question.stemMediaId,
            JSON.stringify(question.content),
            JSON.stringify(question.answer),
            question.explanation,
            input.inPractice,
            input.inMock,
          ]
        );
        await writeMediaLinks(client, rows[0].id, question.mediaIds);
        await logActivity(
          client,
          session,
          "question.created",
          { type: "question", id: rows[0].id, label: questionLogLabel(rows[0].ref_no, question.stemText) },
          { chapter: chapter.title, questionType: questionTypeLabel(question.type) }
        );
        return { ok: true, id: rows[0].id, version: 1 };
      }

      const stored = await readQuestionForUpdate(client, questionId);
      if (!stored) return { ok: false, error: NOT_FOUND };
      if (stored.version !== input.expectedVersion) {
        return {
          ok: false,
          conflict: true,
          error: "Someone else saved this question while you were editing. Copy anything you need, then reload the page.",
        };
      }
      if (stored.type !== question.type) return { ok: false, error: "A question's type can't be changed." };

      const chapterChanged = stored.chapterId !== chapterId;
      let fromChapter = "";
      let toChapter = "";
      if (chapterChanged) {
        const { rows: placed } = await client.query(`select 1 from handbook_items where question_id = $1`, [questionId]);
        if (placed.length > 0) {
          return {
            ok: false,
            error: "This question is in the Handbook. Remove it from the chapter's page order before moving it to another chapter.",
          };
        }
        const chapter = await lockChapter(client, chapterId);
        if (!chapter) return { ok: false, error: CHAPTER_GONE };
        toChapter = chapter.title;
        const { rows: previous } = await client.query<{ title: string }>(`select title from chapters where id = $1`, [
          stored.chapterId,
        ]);
        fromChapter = previous[0]?.title ?? "";
      }
      if (!(await picturesExist(client, question.mediaIds))) return { ok: false, error: PICTURE_GONE };

      const before = parseQuestion(stored);
      const contentChanged = !before.ok || fingerprint(before.question) !== fingerprint(question);
      const usageChanged = stored.inPractice !== input.inPractice || stored.inMock !== input.inMock;
      if (!contentChanged && !usageChanged && !chapterChanged) return { ok: true, id: questionId, version: stored.version };

      const version = stored.version + (contentChanged ? 1 : 0);
      await client.query(
        `update questions
         set chapter_id = $2, stem_text = $3, stem_media_id = $4, content = $5, answer = $6, explanation = $7,
             in_practice = $8, in_mock = $9, content_version = $10, updated_at = now()
         where id = $1`,
        [
          questionId,
          chapterId,
          question.stemText,
          question.stemMediaId,
          JSON.stringify(question.content),
          JSON.stringify(question.answer),
          question.explanation,
          input.inPractice,
          input.inMock,
          version,
        ]
      );
      await writeMediaLinks(client, questionId, question.mediaIds);

      // One entry per kind of change, like the page editor.
      const target = { type: "question" as const, id: questionId, label: questionLogLabel(stored.refNo, question.stemText) };
      if (chapterChanged) {
        await logActivity(client, session, "question.chapter_changed", target, { from: fromChapter, to: toChapter });
      }
      if (contentChanged) {
        await logActivity(client, session, "question.updated", target, {
          from: `Version ${stored.version}`,
          to: `Version ${version}`,
        });
      }
      if (usageChanged) {
        await logActivity(client, session, "question.usage_changed", target, {
          from: describeUsage(stored, input, stored),
          to: describeUsage(stored, input, input),
        });
      }
      return { ok: true, id: questionId, version };
    });
  } catch (error) {
    // A picture or chapter removed between our checks and the write.
    if (getErrorCode(error) === "23503") return { ok: false, error: PICTURE_GONE };
    throw error;
  }

  if (result.ok) revalidateQuestionPaths();
  return result;
}

export async function setQuestionStatus(id: string, status: "draft" | "published"): Promise<QuestionActionState> {
  const session = await requireRole(["superadmin"]);

  const questionId = String(id ?? "");
  if (!isUuid(questionId) || (status !== "draft" && status !== "published")) return { error: NOT_FOUND };

  const result = await withTransaction<QuestionActionState>(async (client) => {
    const question = await readQuestionForUpdate(client, questionId);
    if (!question) return { error: NOT_FOUND };
    if (question.status === status) return { success: true };

    if (status === "published") {
      // Only a question that passes today's checks can be published.
      const parsed = parseQuestion(question);
      if (!parsed.ok) return { error: `This question can't be published yet. ${parsed.error}` };
    }

    await client.query(`update questions set status = $2, updated_at = now() where id = $1`, [questionId, status]);
    await logActivity(client, session, status === "published" ? "question.published" : "question.unpublished", {
      type: "question",
      id: questionId,
      label: questionLogLabel(question.refNo, question.stemText),
    });
    return { success: true };
  });

  revalidateQuestionPaths();
  return result;
}

export async function deleteQuestion(_prev: QuestionActionState, formData: FormData): Promise<QuestionActionState> {
  const session = await requireRole(["superadmin"]);

  const questionId = String(formData.get("questionId") ?? "");
  if (!isUuid(questionId)) return { error: NOT_FOUND };

  let result: QuestionActionState;
  try {
    result = await withTransaction<QuestionActionState>(async (client) => {
      const question = await readQuestionForUpdate(client, questionId);
      if (!question) return { error: "This question has already been deleted." };

      const { rows: used } = await client.query(`select 1 from handbook_items where question_id = $1`, [questionId]);
      if (used.length > 0) return { error: IN_HANDBOOK };

      const { rows: chapter } = await client.query<{ title: string }>(`select title from chapters where id = $1`, [
        question.chapterId,
      ]);
      await client.query(`delete from questions where id = $1`, [questionId]);
      await logActivity(
        client,
        session,
        "question.deleted",
        { type: "question", id: questionId, label: questionLogLabel(question.refNo, question.stemText) },
        { chapter: chapter[0]?.title ?? "", questionType: questionTypeLabel(question.type) }
      );
      return { success: true };
    });
  } catch (error) {
    // Placed in the Handbook between our check and the delete.
    if (getErrorCode(error) === "23503") return { error: IN_HANDBOOK };
    throw error;
  }

  revalidateQuestionPaths();
  return result;
}

function revalidateQuestionPaths() {
  revalidatePath("/admin/questions");
  revalidatePath("/admin/handbook", "layout");
  revalidatePath("/admin/media");
}

async function lockChapter(client: PoolClient, chapterId: string): Promise<{ title: string } | null> {
  const { rows } = await client.query<{ title: string }>(`select title from chapters where id = $1 for share`, [chapterId]);
  return rows[0] ?? null;
}

// FOR SHARE keeps these pictures from being deleted until the save commits.
async function picturesExist(client: PoolClient, mediaIds: string[]): Promise<boolean> {
  if (mediaIds.length === 0) return true;
  const { rows } = await client.query(`select id from media where id = any($1::uuid[]) for share`, [mediaIds]);
  return rows.length === mediaIds.length;
}

async function writeMediaLinks(client: PoolClient, questionId: string, mediaIds: string[]) {
  await client.query(`delete from question_media where question_id = $1`, [questionId]);
  if (mediaIds.length > 0) {
    await client.query(`insert into question_media (question_id, media_id) select $1::uuid, unnest($2::uuid[])`, [
      questionId,
      mediaIds,
    ]);
  }
}

// What candidates see: a change here raises the version. Chapter and usage are tracked separately.
function fingerprint(question: ParsedQuestion): string {
  return JSON.stringify([question.stemText, question.stemMediaId, question.content, question.answer, question.explanation]);
}

type Usage = { inPractice: boolean; inMock: boolean };

// Only the settings that changed, e.g. "Mock test: on" → "Mock test: off".
function describeUsage(before: Usage, after: Usage, value: Usage): string {
  const parts: string[] = [];
  if (before.inPractice !== after.inPractice) parts.push(`Practice: ${value.inPractice ? "on" : "off"}`);
  if (before.inMock !== after.inMock) parts.push(`Mock test: ${value.inMock ? "on" : "off"}`);
  return parts.join(" · ");
}
