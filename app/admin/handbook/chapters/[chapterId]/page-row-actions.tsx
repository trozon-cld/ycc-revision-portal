"use client";

import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton, RowActions, type RowAction } from "@/components/admin/row-actions";
import { inputClass } from "@/components/admin/styles";
import { TITLE_MAX_LENGTH } from "@/lib/limits";
import { moveHandbookItem } from "../../order-actions";
import { createPage, deletePage, renamePage, setPageStatus } from "../../pages/actions";

export function NewPageButton({ chapterId }: { chapterId: string }) {
  return (
    <PanelButton label="New page" title="New page">
      {(close) => (
        <ActionForm
          action={createPage}
          hidden={{ chapterId }}
          submitLabel="Create and edit"
          pendingLabel="Creating…"
          onCancel={close}
        >
          <p className="text-sm text-slate-700">The page is added at the end of this chapter. You can move it afterwards.</p>
          <p className="text-sm text-slate-700">Candidates never see this title. It&apos;s just a label for you.</p>
          <Field id="new-page-title" label="Page title" hint="For example: Gloves and hand protection">
            <input id="new-page-title" name="title" type="text" required maxLength={TITLE_MAX_LENGTH} className={inputClass} />
          </Field>
        </ActionForm>
      )}
    </PanelButton>
  );
}

export function PageRowActions({
  id,
  itemId,
  position,
  title,
  status,
  isFirst,
  isLast,
}: {
  id: string;
  // The page's place in the chapter, for moving it (the same move as questions).
  itemId: string;
  position: number;
  title: string;
  status: "draft" | "published";
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const hidden = { pageId: id };
  const actions: RowAction[] = [
    {
      label: "Edit content",
      run: async () => {
        router.push(`/admin/handbook/pages/${id}`);
        return { success: true };
      },
    },
    {
      label: "Rename",
      title: "Rename page",
      description: "Only admins see page titles.",
      render: (close) => (
        <ActionForm action={renamePage} hidden={hidden} submitLabel="Save title" successMessage="Page renamed." onSuccess={close} onCancel={close}>
          <Field id={`rename-page-${id}`} label="New title">
            <input id={`rename-page-${id}`} name="title" type="text" required maxLength={TITLE_MAX_LENGTH} defaultValue={title} className={inputClass} />
          </Field>
        </ActionForm>
      ),
    },
  ];
  if (!isFirst) actions.push({ label: "Move up", run: () => moveHandbookItem(itemId, position, position - 1), successMessage: "Page moved up." });
  if (!isLast) actions.push({ label: "Move down", run: () => moveHandbookItem(itemId, position, position + 1), successMessage: "Page moved down." });
  actions.push(
    status === "published"
      ? { label: "Unpublish", run: () => setPageStatus(id, "draft"), successMessage: "Page is a draft again." }
      : { label: "Publish", run: () => setPageStatus(id, "published"), successMessage: "Page published." }
  );
  actions.push({
    label: "Delete",
    danger: true,
    title: "Delete page?",
    variant: "confirm",
    render: (close) => (
      <ActionForm
        action={deletePage}
        hidden={hidden}
        submitLabel="Delete"
        pendingLabel="Deleting…"
        variant="danger"
        successMessage="Page deleted."
        onSuccess={close}
        onCancel={close}
      >
        <p className="text-sm [overflow-wrap:anywhere]">
          <strong className="font-medium">{title}</strong> and all its content will be removed. Pictures stay in Media.
          This can&apos;t be undone.
        </p>
      </ActionForm>
    ),
  });

  return <RowActions label={`Actions for page ${title}`} actions={actions} />;
}
