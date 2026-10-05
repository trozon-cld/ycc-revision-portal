"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { RowActions, type RowAction } from "@/components/admin/row-actions";
import { buttonClass, textareaClass } from "@/components/admin/styles";
import { describeMediaUse } from "@/lib/media/usage";
import { ALT_TEXT_MAX_LENGTH } from "@/lib/limits";
import { deleteMedia, updateAltText } from "./actions";

export function MediaRowActions({
  id,
  altText,
  name,
  thumbUrl,
  usedIn,
  usedInQuestions,
  usedInCovers = 0,
}: {
  id: string;
  altText: string;
  name: string;
  thumbUrl?: string;
  usedIn: number;
  usedInQuestions: number;
  usedInCovers?: number;
}) {
  const inUse = usedIn > 0 || usedInQuestions > 0 || usedInCovers > 0;
  const hidden = { mediaId: id };

  const actions: RowAction[] = [
    {
      label: "Edit description",
      title: "Edit description",
      description: name,
      render: (close) => (
        <ActionForm
          action={updateAltText}
          hidden={hidden}
          submitLabel="Save description"
          successMessage="Description saved."
          onSuccess={close}
          onCancel={close}
        >
          {thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link, already a small thumbnail
            <img src={thumbUrl} alt="" className="max-h-48 w-full rounded-md bg-slate-100 object-contain" />
          )}
          <Field id={`alt-${id}`} label="Description" hint="Say what the picture shows, in plain words.">
            <textarea
              id={`alt-${id}`}
              name="altText"
              required
              maxLength={ALT_TEXT_MAX_LENGTH}
              rows={4}
              defaultValue={altText}
              className={textareaClass}
            />
          </Field>
        </ActionForm>
      ),
    },
    {
      label: "Delete",
      danger: true,
      title: inUse ? "Can't delete this picture" : "Delete picture?",
      variant: "confirm",
      render: (close) =>
        inUse ? (
          <div>
            <p className="px-5 py-4 text-sm [overflow-wrap:anywhere]">
              <strong className="font-medium">{name}</strong> is used in {describeMediaUse(usedIn, usedInQuestions, usedInCovers)}.
              {" "}{removeFrom(usedIn, usedInQuestions, usedInCovers)}
            </p>
            <div className="flex justify-end border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={close} className={buttonClass("secondary")}>
                Close
              </button>
            </div>
          </div>
        ) : (
        <ActionForm
          action={deleteMedia}
          hidden={hidden}
          submitLabel="Delete"
          pendingLabel="Deleting…"
          variant="danger"
          successMessage="Picture deleted."
          onSuccess={close}
          onCancel={close}
        >
          <p className="text-sm [overflow-wrap:anywhere]">
            <strong className="font-medium">{name}</strong> will be removed from the library. This can&apos;t be undone.
          </p>
        </ActionForm>
        ),
    },
  ];

  return <RowActions label={`Actions for picture ${name}`} actions={actions} />;
}

function removeFrom(pages: number, questions: number, covers: number): string {
  const kinds = [pages > 0, questions > 0, covers > 0].filter(Boolean).length;
  if (kinds > 1) return "Remove it from all of them first (covers are chosen on the Categories page).";
  if (covers > 0) return `Choose another cover for ${covers === 1 ? "that category" : "those categories"} on the Categories page first.`;
  if (questions === 0) return `Remove it from ${pages === 1 ? "that page" : "those pages"} first.`;
  return `Remove it from ${questions === 1 ? "that question" : "those questions"} first.`;
}
