"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton, RowActions, type RowAction } from "@/components/admin/row-actions";
import { inputClass } from "@/components/admin/styles";
import { createChapter, deleteChapter, moveChapter, renameChapter } from "./actions";

export function NewChapterButton() {
  return (
    <PanelButton label="New chapter" title="New chapter">
      {(close) => (
        <ActionForm
          action={createChapter}
          submitLabel="Add chapter"
          pendingLabel="Adding…"
          successMessage="Chapter added."
          onSuccess={close}
          onCancel={close}
        >
          <Field id="new-chapter-title" label="Chapter title" hint="It's added at the end. You can move it afterwards.">
            <input id="new-chapter-title" name="title" type="text" required maxLength={120} className={inputClass} />
          </Field>
        </ActionForm>
      )}
    </PanelButton>
  );
}

export function ChapterRowActions({
  id,
  title,
  number,
  isFirst,
  isLast,
}: {
  id: string;
  title: string;
  number: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const hidden = { chapterId: id };

  const actions: RowAction[] = [
    {
      label: "Rename",
      title: "Rename chapter",
      description: `Chapter ${number}`,
      render: (close) => (
        <ActionForm
          action={renameChapter}
          hidden={hidden}
          submitLabel="Save title"
          successMessage="Chapter renamed."
          onSuccess={close}
          onCancel={close}
        >
          <Field id={`rename-${id}`} label="New title">
            <input
              id={`rename-${id}`}
              name="title"
              type="text"
              required
              maxLength={120}
              defaultValue={title}
              className={inputClass}
            />
          </Field>
        </ActionForm>
      ),
    },
  ];

  if (!isFirst) {
    actions.push({ label: "Move up", run: () => moveChapter(id, "up"), successMessage: "Chapter moved up." });
  }
  if (!isLast) {
    actions.push({ label: "Move down", run: () => moveChapter(id, "down"), successMessage: "Chapter moved down." });
  }

  actions.push({
    label: "Delete",
    danger: true,
    title: "Delete chapter?",
    variant: "confirm",
    render: (close) => (
      <ActionForm
        action={deleteChapter}
        hidden={hidden}
        submitLabel="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        successMessage="Chapter deleted."
        onSuccess={close}
        onCancel={close}
      >
        <p className="text-sm">
          <strong className="font-medium">
            {number} {title}
          </strong>{" "}
          will be removed and the chapters after it will move up one number. This can&apos;t be undone.
        </p>
      </ActionForm>
    ),
  });

  return <RowActions label={`Actions for ${title}`} actions={actions} />;
}
