"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import Link from "next/link";
import { ActionButton, PanelButton, RowActions, type InstantRowAction, type PanelRowAction, type RowAction } from "@/components/admin/row-actions";
import { buttonClass, inputClass } from "@/components/admin/styles";
import {
  createChapter,
  deleteChapter,
  moveChapter,
  moveChapterToSection,
  publishChapterContent,
  publishChapterForm,
  renameChapter,
  saveChapterTestTypes,
  setChapterStatus,
  unpublishChapterForm,
} from "./chapter-actions";
import type { TestAreaOption } from "@/lib/handbook/test-types";
import { TITLE_MAX_LENGTH } from "@/lib/limits";
import { countOf } from "@/lib/format";
import { TestTypePicker } from "./test-type-picker";
import type { SectionOption } from "./section-row-actions";

const TEST_TYPE_HINT = "Candidates studying these test types see this chapter in Prepare, Practice and the Mock test once it's published.";

export function NewChapterButton({ sections, testAreas }: { sections: SectionOption[]; testAreas: TestAreaOption[] }) {
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
            submitLabel="Create and open"
            pendingLabel="Creating…"
            onCancel={close}
          >
            <Field id="new-chapter-title" label="Chapter title">
              <input id="new-chapter-title" name="title" type="text" required maxLength={TITLE_MAX_LENGTH} className={inputClass} />
            </Field>
            <Field id="new-chapter-section" label="Section" hint="It's added at the end of this section.">
              <SectionSelect id="new-chapter-section" options={sections} />
            </Field>
            <TestTypePicker testAreas={testAreas} legend="Test types (optional)" hint={TEST_TYPE_HINT} />
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
  itemCount,
  draftCount,
  status,
  testAreas,
  testTypeIds,
}: {
  id: string;
  title: string;
  number: string;
  isFirst: boolean;
  isLast: boolean;
  otherSections: SectionOption[];
  pageCount: number;
  questionCount: number;
  itemCount: number;
  draftCount: number;
  status: "draft" | "published";
  testAreas: TestAreaOption[];
  testTypeIds: string[];
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
    label: "Test types",
    title: "Test types",
    description,
    render: (close) => <ChapterTestTypesForm chapterId={id} testAreas={testAreas} initialSelected={testTypeIds} onClose={close} />,
  });

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

  actions.push(chapterStatusAction({ id, number, title, status, itemCount, draftCount, hasTestTypes: testTypeIds.length > 0, onChapterPage: false }));

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
          test types that include it. This can&apos;t be undone.
        </p>
      </ActionForm>
      ),
  });

  return <RowActions label={`Actions for ${title}`} actions={actions} />;
}

function ChapterTestTypesForm({
  chapterId,
  testAreas,
  initialSelected,
  onClose,
}: {
  chapterId: string;
  testAreas: TestAreaOption[];
  initialSelected: string[];
  onClose: () => void;
}) {
  return (
    <ActionForm
      action={saveChapterTestTypes}
      hidden={{ chapterId }}
      submitLabel="Save test types"
      successMessage="Test types updated."
      onSuccess={onClose}
      onCancel={onClose}
    >
      <TestTypePicker testAreas={testAreas} initialSelected={initialSelected} hint={TEST_TYPE_HINT} />
    </ActionForm>
  );
}

export function ChapterTestTypesButton(props: { chapterId: string; testAreas: TestAreaOption[]; initialSelected: string[] }) {
  return (
    <PanelButton label="Test types" title="Test types" variant="secondary" icon={false}>
      {(close) => <ChapterTestTypesForm {...props} onClose={close} />}
    </PanelButton>
  );
}

type ChapterStatusProps = {
  id: string;
  number: string;
  title: string;
  status: "draft" | "published";
  itemCount: number;
  draftCount: number;
  hasTestTypes: boolean;
  // On the chapter's own page the items are right below, so no "Open chapter" link.
  onChapterPage: boolean;
};

// Publish or Unpublish, shared by the Handbook row menu and the chapter page. A chapter that isn't ready says why.
function chapterStatusAction({ id, number, title, status, itemCount, draftCount, hasTestTypes, onChapterPage }: ChapterStatusProps): PanelRowAction | InstantRowAction {
  const name = (
    <strong className="font-medium">
      {number} {title}
    </strong>
  );
  if (status === "published") {
    return {
      label: "Unpublish",
      title: "Unpublish chapter?",
      variant: "confirm",
      render: (close) => (
        <ActionForm
          action={unpublishChapterForm}
          hidden={{ chapterId: id }}
          submitLabel="Unpublish"
          pendingLabel="Unpublishing…"
          successMessage="Chapter is a draft again."
          onSuccess={close}
          onCancel={close}
        >
          <p className="text-sm [overflow-wrap:anywhere]">
            Candidates will no longer see {name}. Its pages and questions stay as they are.
          </p>
        </ActionForm>
      ),
    };
  }
  if (itemCount === 0 || draftCount > 0) {
    return {
      label: "Publish",
      title: "Can't publish yet",
      variant: "confirm",
      render: (close) => (
        <div>
          <p className="px-5 py-4 text-sm [overflow-wrap:anywhere]">
            {name}{" "}
            {itemCount === 0
              ? "has no pages or questions yet. Add at least one, publish it, then publish the chapter."
              : `${draftCount === 1 ? "has 1 item that is" : `has ${draftCount} items that are`} still ${draftCount === 1 ? "a draft" : "drafts"}. Publish ${draftCount === 1 ? "it" : "them"} first, then publish the chapter.${onChapterPage ? " Publish all does both in one step." : ""}`}
          </p>
          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
            <button type="button" onClick={close} className={buttonClass("secondary")}>
              Close
            </button>
            {!onChapterPage && (
              <Link href={`/admin/handbook/chapters/${id}`} className={buttonClass("primary")}>
                Open chapter
              </Link>
            )}
          </div>
        </div>
      ),
    };
  }
  if (hasTestTypes) {
    return { label: "Publish", run: () => setChapterStatus(id, "published"), successMessage: "Chapter published.", pendingLabel: "Publishing…" };
  }
  return {
    label: "Publish",
    title: "Publish chapter?",
    variant: "confirm",
    render: (close) => (
      <ActionForm
        action={publishChapterForm}
        hidden={{ chapterId: id }}
        submitLabel="Publish anyway"
        pendingLabel="Publishing…"
        successMessage="Chapter published."
        onSuccess={close}
        onCancel={close}
      >
        <p className="text-sm [overflow-wrap:anywhere]">
          {name} isn&apos;t in any test type yet, so no candidate will see it. Add it to test types with the Test types
          {onChapterPage ? " button" : " action"}.
        </p>
      </ActionForm>
    ),
  };
}

export function ChapterStatusButton(props: Omit<ChapterStatusProps, "onChapterPage">) {
  return <ActionButton action={chapterStatusAction({ ...props, onChapterPage: true })} />;
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

export type PublishAllSummary = {
  pages: number;
  questions: number;
  heldBack: string;
  heldBackCount: number;
  // True when nothing in the page order stays a draft, so the chapter goes live too.
  chapterGoesLive: boolean;
  hasTestTypes: boolean;
};

// "Publish all" on the chapter page: publishes the drafts that are ready (and the chapter once nothing is left).
export function PublishAllButton({ chapterId, number, title, summary }: { chapterId: string; number: string; title: string; summary: PublishAllSummary }) {
  const { pages, questions, heldBack, heldBackCount, chapterGoesLive, hasTestTypes } = summary;
  const ready = pages + questions;
  const what = [pages > 0 ? countOf(pages, "page") : "", questions > 0 ? countOf(questions, "question") : ""].filter(Boolean).join(" and ");
  const name = (
    <strong className="font-medium">
      {number} {title}
    </strong>
  );
  const action: PanelRowAction = {
    label: "Publish all",
    title: ready > 0 ? "Publish all drafts?" : "Nothing ready to publish",
    variant: "confirm",
    render: (close) =>
      ready === 0 ? (
        <div>
          <p className="px-5 py-4 text-sm [overflow-wrap:anywhere]">
            None of the drafts in {name} can be published yet: {heldBack}. Fix them, then try again.
          </p>
          <div className="flex justify-end border-t border-slate-200 px-5 py-3">
            <button type="button" onClick={close} className={buttonClass("secondary")}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <ActionForm
          action={publishChapterContent}
          hidden={{ chapterId }}
          submitLabel={`Publish ${countOf(ready, "item")}`}
          pendingLabel="Publishing…"
          successMessage={chapterGoesLive ? `Published ${what}, and the chapter.` : `Published ${what}.`}
          onSuccess={close}
          onCancel={close}
        >
          <div className="space-y-2 text-sm [overflow-wrap:anywhere]">
            <p>
              {what} in {name} {ready === 1 ? "is" : "are"} ready and will be published.
            </p>
            {heldBackCount > 0 && (
              <p>
                {heldBackCount === 1 ? "1 item can't be published yet and stays a draft" : `${heldBackCount} items can't be published yet and stay drafts`}:{" "}
                {heldBack}.
              </p>
            )}
            {chapterGoesLive ? (
              <p>
                The chapter is published too
                {hasTestTypes ? ", so candidates in its test types see it." : ". It isn't in any test type yet, so no candidate sees it until it's added to one."}
              </p>
            ) : (
              <p>The chapter itself stays as it is until everything in its page order is published.</p>
            )}
          </div>
        </ActionForm>
      ),
  };
  return <ActionButton action={action} />;
}
