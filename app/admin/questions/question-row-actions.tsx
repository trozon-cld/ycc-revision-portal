"use client";

import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton, RowActions, type RowAction } from "@/components/admin/row-actions";
import { buttonClass, inputClass } from "@/components/admin/styles";
import type { SectionOptions } from "@/lib/questions/queries";
import type { QuestionType } from "@/lib/questions/types";
import { deleteQuestion, setQuestionStatus } from "./actions";

// Opens the editor for a new question; nothing is stored until its first save.
export function NewQuestionButton({
  types,
  chapters,
  defaultChapterId,
}: {
  types: { key: QuestionType; label: string }[];
  chapters: SectionOptions[];
  defaultChapterId: string | null;
}) {
  const router = useRouter();
  return (
    <PanelButton label="New question" title="New question">
      {(close) => (
        <form
          className="flex h-full flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const query = new URLSearchParams({ type: String(data.get("type")), chapter: String(data.get("chapter")) });
            close();
            router.push(`/admin/questions/new?${query.toString()}`);
          }}
        >
          <div className="flex-1 space-y-4 px-5 py-4">
            <Field id="new-question-type" label="Question type">
              <select id="new-question-type" name="type" required defaultValue={types[0]?.key} className={inputClass}>
                {types.map((type) => (
                  <option key={type.key} value={type.key}>
                    {type.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="new-question-chapter" label="Chapter" hint="You can change it in the editor.">
              <select id="new-question-chapter" name="chapter" required defaultValue={defaultChapterId ?? ""} className={inputClass}>
                <option value="" disabled>
                  Choose a chapter
                </option>
                {chapters
                  .filter((section) => section.chapters.length > 0)
                  .map((section) => (
                    <optgroup key={section.id} label={section.label}>
                      {section.chapters.map((chapter) => (
                        <option key={chapter.id} value={chapter.id}>
                          {chapter.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
              </select>
            </Field>
          </div>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
            <button type="button" onClick={close} className={buttonClass("secondary")}>
              Cancel
            </button>
            <button type="submit" className={buttonClass("primary")}>
              Continue
            </button>
          </div>
        </form>
      )}
    </PanelButton>
  );
}

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
  const router = useRouter();
  const actions: RowAction[] = [
    {
      label: "Edit",
      run: async () => {
        router.push(`/admin/questions/${id}`);
        return { success: true };
      },
    },
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
