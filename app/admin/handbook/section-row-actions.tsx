"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton, RowActions, type RowAction } from "@/components/admin/row-actions";
import { buttonClass, inputClass } from "@/components/admin/styles";
import { TITLE_MAX_LENGTH } from "@/lib/limits";
import { createSection, deleteSection, moveSection, renameSection, setSectionLinking } from "./section-actions";

const LINKING_HINT = "Each chapter in it is in every test type's book (like A–D). Leave unticked for chapters that belong to one test type each (like E).";

export type SectionOption = { id: string; label: string; linkedToAll: boolean };

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
            <input id="new-section-title" name="title" type="text" required maxLength={TITLE_MAX_LENGTH} className={inputClass} />
          </Field>
          <LinkingCheckbox id="new-section-linked" defaultChecked={false} />
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
  linkedToAll,
  isFirst,
  isLast,
}: {
  id: string;
  label: string;
  title: string;
  chapterCount: number;
  linkedToAll: boolean;
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
              maxLength={TITLE_MAX_LENGTH}
              defaultValue={title}
              className={inputClass}
            />
          </Field>
        </ActionForm>
      ),
    },
  ];

  actions.push({
    label: "Test type linking",
    title: "Test type linking",
    description: label,
    variant: chapterCount > 0 ? "confirm" : "panel",
    render: (close) =>
      chapterCount > 0 ? (
        <div>
          <p className="px-5 py-4 text-sm">
            {linkedToAll
              ? "Each chapter in this section is in every test type's book."
              : "Each chapter in this section belongs to one test type at most."}{" "}
            This can only be changed while the section has no chapters.
          </p>
          <div className="flex justify-end border-t border-slate-200 px-5 py-3">
            <button type="button" onClick={close} className={buttonClass("secondary")}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <ActionForm
          action={setSectionLinking}
          hidden={hidden}
          submitLabel="Save"
          successMessage="Section linking saved."
          onSuccess={close}
          onCancel={close}
        >
          <LinkingCheckbox id={`linked-${id}`} defaultChecked={linkedToAll} />
        </ActionForm>
      ),
  });

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

function LinkingCheckbox({ id, defaultChecked }: { id: string; defaultChecked: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <input id={id} name="linkedToAll" type="checkbox" defaultChecked={defaultChecked} aria-describedby={`${id}-hint`} className="mt-0.5 size-4 shrink-0 accent-primary" />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink">
          Linked to every test type
        </label>
        <p id={`${id}-hint`} className="text-sm text-slate-600">
          {LINKING_HINT}
        </p>
      </div>
    </div>
  );
}
