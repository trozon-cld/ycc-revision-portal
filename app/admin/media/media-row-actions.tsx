"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { RowActions, type RowAction } from "@/components/admin/row-actions";
import { buttonClass, textareaClass } from "@/components/admin/styles";
import { deleteMedia, updateAltText } from "./actions";

export function MediaRowActions({
  id,
  altText,
  name,
  thumbUrl,
  usedIn,
}: {
  id: string;
  altText: string;
  name: string;
  thumbUrl?: string;
  usedIn: number;
}) {
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
              maxLength={300}
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
      title: usedIn > 0 ? "Can't delete this picture" : "Delete picture?",
      variant: "confirm",
      render: (close) =>
        usedIn > 0 ? (
          <div>
            <p className="px-5 py-4 text-sm [overflow-wrap:anywhere]">
              <strong className="font-medium">{name}</strong> is used in {usedIn} Handbook page{usedIn === 1 ? "" : "s"}.
              Remove it from {usedIn === 1 ? "that page" : "those pages"} first.
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
