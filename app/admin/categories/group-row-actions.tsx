"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton, RowActions, type RowAction } from "@/components/admin/row-actions";
import { buttonClass, inputClass } from "@/components/admin/styles";
import { createGroup, deleteGroup, moveGroup, renameGroup } from "./group-actions";

export function NewGroupButton() {
  return (
    <PanelButton label="New group" title="New group" variant="secondary">
      {(close) => (
        <ActionForm
          action={createGroup}
          submitLabel="Add group"
          pendingLabel="Adding…"
          successMessage="Group added."
          onSuccess={close}
          onCancel={close}
        >
          <Field id="new-group-name" label="Group name" hint="It's added at the end. You can move it afterwards.">
            <input id="new-group-name" name="name" type="text" required maxLength={100} className={inputClass} />
          </Field>
        </ActionForm>
      )}
    </PanelButton>
  );
}

export function GroupRowActions({
  id,
  name,
  categoryCount,
  isFirst,
  isLast,
}: {
  id: string;
  name: string;
  categoryCount: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const hidden = { groupId: id };

  const actions: RowAction[] = [
    {
      label: "Rename",
      title: "Rename group",
      description: name,
      render: (close) => (
        <ActionForm
          action={renameGroup}
          hidden={hidden}
          submitLabel="Save name"
          successMessage="Group renamed."
          onSuccess={close}
          onCancel={close}
        >
          <Field id={`rename-group-${id}`} label="New name">
            <input
              id={`rename-group-${id}`}
              name="name"
              type="text"
              required
              maxLength={100}
              defaultValue={name}
              className={inputClass}
            />
          </Field>
        </ActionForm>
      ),
    },
  ];

  if (!isFirst) actions.push({ label: "Move up", run: () => moveGroup(id, "up"), successMessage: "Group moved up." });
  if (!isLast) {
    actions.push({ label: "Move down", run: () => moveGroup(id, "down"), successMessage: "Group moved down." });
  }

  actions.push({
    label: "Delete",
    danger: true,
    title: categoryCount > 0 ? "Can't delete this group" : "Delete group?",
    variant: "confirm",
    render: (close) =>
      categoryCount > 0 ? (
        <div>
          <p className="px-5 py-4 text-sm">
            <strong className="font-medium">{name}</strong> still has {categoryCount} categor
            {categoryCount === 1 ? "y" : "ies"}. Move them to another group or delete them first.
          </p>
          <div className="flex justify-end border-t border-slate-200 px-5 py-3">
            <button type="button" onClick={close} className={buttonClass("secondary")}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <ActionForm
          action={deleteGroup}
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
