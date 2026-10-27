"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton, RowActions, type RowAction } from "@/components/admin/row-actions";
import { buttonClass, inputClass } from "@/components/admin/styles";
import { TEST_TYPE_NAME_MAX_LENGTH } from "@/lib/limits";
import { createTestArea, deleteTestArea, moveTestArea, renameTestArea } from "./test-area-actions";

export function NewTestAreaButton() {
  return (
    <PanelButton label="New group" title="New group" variant="secondary">
      {(close) => (
        <ActionForm
          action={createTestArea}
          submitLabel="Add group"
          pendingLabel="Adding…"
          successMessage="Group added."
          onSuccess={close}
          onCancel={close}
        >
          <Field id="new-test-area-name" label="Group name" hint="It's added at the end. You can move it afterwards.">
            <input id="new-test-area-name" name="name" type="text" required maxLength={TEST_TYPE_NAME_MAX_LENGTH} className={inputClass} />
          </Field>
        </ActionForm>
      )}
    </PanelButton>
  );
}

export function TestAreaRowActions({
  id,
  name,
  testTypeCount,
  isFirst,
  isLast,
}: {
  id: string;
  name: string;
  testTypeCount: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const hidden = { testAreaId: id };

  const actions: RowAction[] = [
    {
      label: "Rename",
      title: "Rename group",
      description: name,
      render: (close) => (
        <ActionForm
          action={renameTestArea}
          hidden={hidden}
          submitLabel="Save name"
          successMessage="Group renamed."
          onSuccess={close}
          onCancel={close}
        >
          <Field id={`rename-test-area-${id}`} label="New name">
            <input
              id={`rename-test-area-${id}`}
              name="name"
              type="text"
              required
              maxLength={TEST_TYPE_NAME_MAX_LENGTH}
              defaultValue={name}
              className={inputClass}
            />
          </Field>
        </ActionForm>
      ),
    },
  ];

  if (!isFirst) actions.push({ label: "Move up", run: () => moveTestArea(id, "up"), successMessage: "Group moved up." });
  if (!isLast) {
    actions.push({ label: "Move down", run: () => moveTestArea(id, "down"), successMessage: "Group moved down." });
  }

  actions.push({
    label: "Delete",
    danger: true,
    title: testTypeCount > 0 ? "Can't delete this group" : "Delete group?",
    variant: "confirm",
    render: (close) =>
      testTypeCount > 0 ? (
        <div>
          <p className="px-5 py-4 text-sm">
            <strong className="font-medium">{name}</strong> still has {testTypeCount} categor
            {testTypeCount === 1 ? "y" : "ies"}. Move them to another group or delete them first.
          </p>
          <div className="flex justify-end border-t border-slate-200 px-5 py-3">
            <button type="button" onClick={close} className={buttonClass("secondary")}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <ActionForm
          action={deleteTestArea}
          hidden={hidden}
          submitLabel="Delete"
          pendingLabel="Deleting…"
          variant="danger"
          successMessage="Group deleted."
          onSuccess={close}
          onCancel={close}
        >
          <p className="text-sm">
            <strong className="font-medium">{name}</strong> will be removed. This can&apos;t be undone.
          </p>
        </ActionForm>
      ),
  });

  return <RowActions label={`Actions for group ${name}`} actions={actions} />;
}
