"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton, RowActions, type RowAction } from "@/components/admin/row-actions";
import { buttonClass, inputClass } from "@/components/admin/styles";
import { createSection, deleteSection, moveSection, renameSection } from "./section-actions";

export type SectionOption = { id: string; label: string };

export function NewSectionButton() {
  return (
    <PanelButton label="New section" title="New section" variant="secondary">
      {(close) => (
        <ActionForm
          action={createSection}
          submitLabel="Add section"
          pendingLabel="Adding…"
          successMessage="Section added."
          onSuccess={close}
          onCancel={close}
        >
          <Field id="new-section-title" label="Section title" hint="It's added at the end. You can move it afterwards.">
            <input id="new-section-title" name="title" type="text" required maxLength={120} className={inputClass} />
          </Field>
        </ActionForm>
      )}
    </PanelButton>
  );
}

export function SectionRowActions({
  id,
  label,
  title,
  chapterCount,
  isFirst,
  isLast,
}: {
  id: string;
  label: string;
  title: string;
  chapterCount: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const hidden = { sectionId: id };

  const actions: RowAction[] = [
    {
      label: "Rename",
      title: "Rename section",
      description: label,
      render: (close) => (
        <ActionForm
          action={renameSection}
          hidden={hidden}
          submitLabel="Save title"
          successMessage="Section renamed."
          onSuccess={close}
          onCancel={close}
        >
          <Field id={`rename-section-${id}`} label="New title">
            <input
              id={`rename-section-${id}`}
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
    actions.push({ label: "Move up", run: () => moveSection(id, "up"), successMessage: "Section moved up." });
  }
  if (!isLast) {
    actions.push({ label: "Move down", run: () => moveSection(id, "down"), successMessage: "Section moved down." });
  }

  actions.push({
    label: "Delete",
    danger: true,
    title: chapterCount > 0 ? "Can't delete this section" : "Delete section?",
    variant: "confirm",
    render: (close) =>
      chapterCount > 0 ? (
        <div>
          <p className="px-5 py-4 text-sm">
            <strong className="font-medium">{label}</strong> still has {chapterCount} chapter
            {chapterCount === 1 ? "" : "s"}. Move them to another section or delete them first.
          </p>
          <div className="flex justify-end border-t border-slate-200 px-5 py-3">
            <button type="button" onClick={close} className={buttonClass("secondary")}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <ActionForm
          action={deleteSection}
          hidden={hidden}
          submitLabel="Delete"
          pendingLabel="Deleting…"
          variant="danger"
          successMessage="Section deleted."
          onSuccess={close}
          onCancel={close}
        >
          <p className="text-sm">
            <strong className="font-medium">{label}</strong> will be removed and the sections after it will move up
            one letter. This can&apos;t be undone.
          </p>
        </ActionForm>
      ),
  });

  return <RowActions label={`Actions for section ${title}`} actions={actions} />;
}
