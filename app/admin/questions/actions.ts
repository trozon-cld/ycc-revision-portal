"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { questionLogLabel } from "@/lib/questions/labels";
import { readQuestionForUpdate } from "@/lib/questions/queries";
import { questionTypeLabel } from "@/lib/questions/registry";
import { isUuid, parseQuestion } from "@/lib/questions/validate";

export type QuestionActionState = { error?: string; success?: boolean };

const NOT_FOUND = "This question no longer exists.";
const IN_HANDBOOK = "This question is in the Handbook. Remove it from the chapter's page order first.";

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
