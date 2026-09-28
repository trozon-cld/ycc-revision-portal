"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton, RowActions, type RowAction } from "@/components/admin/row-actions";
import { buttonClass, inputClass } from "@/components/admin/styles";
import {
  createChapter,
  deleteChapter,
  moveChapter,
  moveChapterToSection,
  renameChapter,
  setChapterStatus,
  unpublishChapterForm,
} from "./chapter-actions";
import type { SectionOption } from "./section-row-actions";

export function NewChapterButton({ sections }: { sections: SectionOption[] }) {
  return (
    <PanelButton label="New chapter" title="New chapter">
      {(close) =>
        sections.length === 0 ? (
          <div>
            <p className="px-5 py-4 text-sm">Add a section first. Every chapter belongs to a section.</p>
            <div className="flex justify-end border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={close} className={buttonClass("secondary")}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <ActionForm
            action={createChapter}
            submitLabel="Add chapter"
            pendingLabel="Adding…"
            successMessage="Chapter added."
            onSuccess={close}
            onCancel={close}
          >
            <Field id="new-chapter-title" label="Chapter title">
              <input id="new-chapter-title" name="title" type="text" required maxLength={120} className={inputClass} />
            </Field>
            <Field id="new-chapter-section" label="Section" hint="It's added at the end of this section.">
              <SectionSelect id="new-chapter-section" options={sections} />
            </Field>
          </ActionForm>
        )
      }
    </PanelButton>
  );
}

export function ChapterRowActions({
  id,
  title,
  number,
  isFirst,
  isLast,
  otherSections,
  pageCount,
  questionCount,
  status,
}: {
  id: string;
  title: string;
  number: string;
  isFirst: boolean;
  isLast: boolean;
  otherSections: SectionOption[];
  pageCount: number;
  questionCount: number;
  status: "draft" | "published";
}) {
  const hidden = { chapterId: id };
  const description = `Chapter ${number} · ${title}`;

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

  if (otherSections.length > 0) {
    actions.push({
      label: "Move to section",
      title: "Move to section",
      description,
      render: (close) => (
        <ActionForm
          action={moveChapterToSection}
          hidden={hidden}
          submitLabel="Move chapter"
          pendingLabel="Moving…"
          successMessage="Chapter moved."
          onSuccess={close}
          onCancel={close}
        >
          <Field id={`move-${id}`} label="Section" hint="It's added at the end of that section.">
            <SectionSelect id={`move-${id}`} options={otherSections} />
          </Field>
        </ActionForm>
      ),
    });
  }

  actions.push(
    status === "draft"
      ? { label: "Publish", run: () => setChapterStatus(id, "published"), successMessage: "Chapter published." }
      : {
          label: "Unpublish",
          title: "Unpublish chapter?",
          variant: "confirm",
          render: (close) => (
            <ActionForm
              action={unpublishChapterForm}
              hidden={hidden}
              submitLabel="Unpublish"
              pendingLabel="Unpublishing…"
              successMessage="Chapter is a draft again."
              onSuccess={close}
              onCancel={close}
            >
              <p className="text-sm [overflow-wrap:anywhere]">
                Candidates will no longer see{" "}
                <strong className="font-medium">
                  {number} {title}
                </strong>
                . Its pages and questions stay as they are.
              </p>
            </ActionForm>
          ),
        }
  );

  actions.push({
    label: "Delete",
    danger: true,
    title: pageCount > 0 || questionCount > 0 ? "Can't delete this chapter" : "Delete chapter?",
    variant: "confirm",
    render: (close) =>
      pageCount > 0 || questionCount > 0 ? (
        <div>
          <p className="px-5 py-4 text-sm">
            <strong className="font-medium">
              {number} {title}
            </strong>{" "}
            still has {blockedBy(pageCount, questionCount)}. Delete them first.
          </p>
          <div className="flex justify-end border-t border-slate-200 px-5 py-3">
            <button type="button" onClick={close} className={buttonClass("secondary")}>
              Close
            </button>
          </div>
        </div>
      ) : (
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
          will be removed and the chapters after it will move up one number. It&apos;s also removed from any
          categories that include it. This can&apos;t be undone.
        </p>
      </ActionForm>
      ),
  });

  return <RowActions label={`Actions for ${title}`} actions={actions} />;
}

function blockedBy(pages: number, questions: number): string {
  const parts: string[] = [];
  if (pages > 0) parts.push(`${pages} page${pages === 1 ? "" : "s"}`);
  if (questions > 0) parts.push(`${questions} question${questions === 1 ? "" : "s"}`);
  return parts.join(" and ");
}

function SectionSelect({ id, options }: { id: string; options: SectionOption[] }) {
  return (
    <select id={id} name="sectionId" required defaultValue="" className={inputClass}>
      <option value="" disabled>
        Choose a section
      </option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
