"use client";

import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton, RowActions, type RowAction } from "@/components/admin/row-actions";
import { buttonClass, inputClass } from "@/components/admin/styles";
import { TEST_TYPE_NAME_MAX_LENGTH } from "@/lib/limits";
import type { ListenMode } from "@/lib/voice/language-store";
import { createTestType, deleteTestType, moveTestTypeToTestArea, renameTestType } from "./actions";
import { TestTypeListenForm, type ListenLanguageOption } from "./test-type-listen-form";
import { TestTypeChaptersForm, type ChapterOutline } from "./test-type-chapters-form";
import { TestTypeCoversForm, type CoverChoice } from "./test-type-covers-form";

export type TestAreaOption = { id: string; name: string };

export function NewTestTypeButton({ testAreas }: { testAreas: TestAreaOption[] }) {
  return (
    <PanelButton label="New test type" title="New test type">
      {(close) => (
        <ActionForm
          action={createTestType}
          submitLabel="Add test type"
          pendingLabel="Adding…"
          successMessage="Test type added."
          onSuccess={close}
          onCancel={close}
        >
          <Field id="new-test-type-name" label="Test type name">
            <input id="new-test-type-name" name="name" type="text" required maxLength={TEST_TYPE_NAME_MAX_LENGTH} className={inputClass} />
          </Field>
          <Field id="new-test-type-area" label="Test area">
            <select id="new-test-type-area" name="testAreaId" required className={inputClass}>
              {testAreas.map((testArea) => (
                <option key={testArea.id} value={testArea.id}>
                  {testArea.name}
                </option>
              ))}
            </select>
          </Field>
        </ActionForm>
      )}
    </PanelButton>
  );
}

export function TestTypeRowActions({
  id,
  name,
  candidateCount,
  outline,
  linkedChapterIds,
  otherTestAreas,
  covers,
  storageReady,
  listenMode,
  listenChosen,
  listenLanguages,
}: {
  id: string;
  name: string;
  candidateCount: number;
  outline: ChapterOutline;
  linkedChapterIds: string[];
  otherTestAreas: TestAreaOption[];
  covers: { front: CoverChoice | null; back: CoverChoice | null };
  storageReady: boolean;
  listenMode: ListenMode;
  listenChosen: string[];
  listenLanguages: ListenLanguageOption[];
}) {
  const hidden = { testTypeId: id };
  const countLabel = `${candidateCount} candidate${candidateCount === 1 ? "" : "s"}`;

  const actions: RowAction[] = [
    {
      label: "Chapters",
      title: `Chapters for ${name}`,
      description: "Tick the chapters candidates studying this test type see in Prepare, Practice and the Mock test.",
      render: (close) => (
        <TestTypeChaptersForm testTypeId={id} outline={outline} initialSelected={linkedChapterIds} onClose={close} />
      ),
    },
    {
      label: "Covers",
      title: `Covers for ${name}`,
      description: "The front and back of this test type's Handbook.",
      render: (close) => (
        <TestTypeCoversForm
          testTypeId={id}
          testTypeName={name}
          initialFront={covers.front}
          initialBack={covers.back}
          storageReady={storageReady}
          onClose={close}
        />
      ),
    },
    {
      label: "Rename",
      title: "Rename test type",
      description: name,
      render: (close) => (
        <ActionForm
          action={renameTestType}
          hidden={hidden}
          submitLabel="Save name"
          successMessage="Test type renamed."
          onSuccess={close}
          onCancel={close}
        >
          <Field id={`rename-${id}`} label="New name" hint="Candidates in this test type stay in it; only the name changes.">
            <input
              id={`rename-${id}`}
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
    {
      label: "Listen",
      title: `Listen for ${name}`,
      description: "Whether candidates in this test type can listen, and in which languages.",
      render: (close) => (
        <TestTypeListenForm
          testTypeId={id}
          testTypeName={name}
          initialMode={listenMode}
          initialChosen={listenChosen}
          languages={listenLanguages}
          onClose={close}
        />
      ),
    },
    ...(otherTestAreas.length > 0 ? [moveToTestAreaAction()] : []),
    {
      label: "Delete",
      danger: true,
      title: candidateCount > 0 ? "Can't delete this test type" : "Delete test type?",
      variant: "confirm",
      render: (close) =>
        candidateCount > 0 ? (
          <div>
            <p className="px-5 py-4 text-sm">
              <strong className="font-medium">{name}</strong> has {countLabel}. Their Admins need to move them to
              another test type first.
            </p>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={close} className={buttonClass("secondary")}>
                Close
              </button>
              <Link href={`/admin/candidates?testType=${id}`} className={buttonClass("primary")}>
                See these candidates
              </Link>
            </div>
          </div>
        ) : (
          <ActionForm
            action={deleteTestType}
            hidden={hidden}
            submitLabel="Delete"
            pendingLabel="Deleting…"
            variant="danger"
            successMessage="Test type deleted."
            onSuccess={close}
            onCancel={close}
          >
            <p className="text-sm">
              <strong className="font-medium">{name}</strong> will be removed, and Admins will no longer be able to
              choose it for new candidates. This can&apos;t be undone.
            </p>
          </ActionForm>
        ),
    },
  ];

  function moveToTestAreaAction(): RowAction {
    return {
      label: "Move to test area",
      title: candidateCount > 0 ? "Can't move this test type" : "Move to test area",
      description: candidateCount > 0 ? undefined : name,
      variant: candidateCount > 0 ? "confirm" : "panel",
      render: (close) =>
        candidateCount > 0 ? (
          <div>
            <p className="px-5 py-4 text-sm">
              <strong className="font-medium">{name}</strong> has {countLabel}. Candidates can only switch within their
              test area, so it can&apos;t move while they use it.
            </p>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={close} className={buttonClass("secondary")}>
                Close
              </button>
              <Link href={`/admin/candidates?testType=${id}`} className={buttonClass("primary")}>
                See these candidates
              </Link>
            </div>
          </div>
        ) : (
          <ActionForm
            action={moveTestTypeToTestArea}
            hidden={hidden}
            submitLabel="Move"
            pendingLabel="Moving…"
            successMessage="Test type moved."
            onSuccess={close}
            onCancel={close}
          >
            <Field id={`move-test-area-${id}`} label="Move to">
              <select id={`move-test-area-${id}`} name="testAreaId" required className={inputClass}>
                {otherTestAreas.map((testArea) => (
                  <option key={testArea.id} value={testArea.id}>
                    {testArea.name}
                  </option>
                ))}
              </select>
            </Field>
          </ActionForm>
        ),
    };
  }

  return <RowActions label={`Actions for ${name}`} actions={actions} />;
}
