"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton, RowActions, type RowAction } from "@/components/admin/row-actions";
import { buttonClass, inputClass } from "@/components/admin/styles";
import { createCategory, deleteCategory, renameCategory } from "./actions";

export function NewCategoryButton() {
  return (
    <PanelButton label="New category" title="New category">
      {(close) => (
        <ActionForm
          action={createCategory}
          submitLabel="Add category"
          pendingLabel="Adding…"
          successMessage="Category added."
          onSuccess={close}
          onCancel={close}
        >
          <Field id="new-category-name" label="Category name">
            <input id="new-category-name" name="name" type="text" required maxLength={100} className={inputClass} />
          </Field>
        </ActionForm>
      )}
    </PanelButton>
  );
}

export function CategoryRowActions({
  id,
  name,
  candidateCount,
}: {
  id: string;
  name: string;
  candidateCount: number;
}) {
  const hidden = { categoryId: id };
  const countLabel = `${candidateCount} candidate${candidateCount === 1 ? "" : "s"}`;

  const actions: RowAction[] = [
    {
      label: "Rename",
      title: "Rename category",
      description: name,
      render: (close) => (
        <ActionForm
          action={renameCategory}
          hidden={hidden}
          submitLabel="Save name"
          successMessage="Category renamed."
          onSuccess={close}
          onCancel={close}
        >
          <Field id={`rename-${id}`} label="New name" hint="Candidates in this category stay in it; only the name changes.">
            <input
              id={`rename-${id}`}
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
    {
      label: "Delete",
      danger: true,
      title: candidateCount > 0 ? "Can't delete this category" : "Delete category?",
      variant: "confirm",
      render: (close) =>
        candidateCount > 0 ? (
          <div>
            <p className="px-5 py-4 text-sm">
              <strong className="font-medium">{name}</strong> has {countLabel}. Their admins need to move them to
              another category first.
            </p>
            <div className="flex justify-end border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={close} className={buttonClass("secondary")}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <ActionForm
            action={deleteCategory}
            hidden={hidden}
            submitLabel="Delete"
            pendingLabel="Deleting…"
            variant="danger"
            successMessage="Category deleted."
            onSuccess={close}
            onCancel={close}
          >
            <p className="text-sm">
              <strong className="font-medium">{name}</strong> will be removed, and admins will no longer be able to
              choose it for new candidates. This can&apos;t be undone.
            </p>
          </ActionForm>
        ),
    },
  ];

  return <RowActions label={`Actions for ${name}`} actions={actions} />;
}
