"use client";

import { ActionForm } from "@/components/admin/action-form";
import { RowActions, type RowAction } from "@/components/admin/row-actions";
import { buttonClass } from "@/components/admin/styles";
import { deleteQuestion, setQuestionStatus } from "./actions";

export function QuestionRowActions({
  id,
  refLabel,
  status,
  bookChapter,
}: {
  id: string;
  refLabel: string;
  status: "draft" | "published";
  bookChapter: string | null;
}) {
  const actions: RowAction[] = [
    status === "published"
      ? { label: "Unpublish", run: () => setQuestionStatus(id, "draft"), successMessage: "Question is a draft again." }
      : { label: "Publish", run: () => setQuestionStatus(id, "published"), successMessage: "Question published." },
    {
      label: "Delete",
      danger: true,
      title: bookChapter ? "Can't delete this question" : "Delete question?",
      variant: "confirm",
      render: (close) =>
        bookChapter ? (
          <div>
            <p className="px-5 py-4 text-sm">
              <strong className="font-medium">{refLabel}</strong> is in the Handbook, in chapter {bookChapter}. Remove it
              from that chapter&apos;s page order first.
            </p>
            <div className="flex justify-end border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={close} className={buttonClass("secondary")}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <ActionForm
            action={deleteQuestion}
            hidden={{ questionId: id }}
            submitLabel="Delete"
            pendingLabel="Deleting…"
            variant="danger"
            successMessage="Question deleted."
            onSuccess={close}
            onCancel={close}
          >
            <p className="text-sm">
              <strong className="font-medium">{refLabel}</strong> will be removed from the question bank. Pictures stay in
              Media. This can&apos;t be undone.
            </p>
          </ActionForm>
        ),
    },
  ];

  return <RowActions label={`Actions for question ${refLabel}`} actions={actions} />;
}
