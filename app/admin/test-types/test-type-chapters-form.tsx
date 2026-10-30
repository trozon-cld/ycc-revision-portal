"use client";

import { useEffect, useRef, useState } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { buttonClass } from "@/components/admin/styles";
import { countOf } from "@/lib/format";
import { saveTestTypeChapters } from "./actions";

// Sections linked to every test type (A–D) are always in; other chapters (E) belong to one test type.
export type ChapterOutline = {
  id: string;
  label: string;
  linkedToAll: boolean;
  chapters: { id: string; number: string; title: string; owners: { id: string; name: string }[] }[];
}[];

const checkboxClass = "size-4 shrink-0 accent-primary disabled:opacity-60";

export function TestTypeChaptersForm({
  testTypeId,
  testTypeName,
  studying,
  outline,
  initialSelected,
  locked,
  onClose,
}: {
  testTypeId: string;
  testTypeName: string;
  // Candidates whose current test type this is: they lose a removed chapter straight away.
  studying: number;
  outline: ChapterOutline;
  initialSelected: string[];
  locked: boolean;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const total = outline.reduce((sum, section) => sum + section.chapters.length, 0);

  if (total === 0) {
    return (
      <div>
        <p className="px-5 py-4 text-sm">There are no chapters yet. Add them on the Handbook page first.</p>
        <CloseBar onClose={onClose} />
      </div>
    );
  }

  const ownedElsewhere = (chapter: ChapterOutline[number]["chapters"][number]) =>
    !initialSelected.includes(chapter.id) && chapter.owners.some((owner) => owner.id !== testTypeId);
  const removed = outline
    .filter((section) => !section.linkedToAll)
    .flatMap((section) => section.chapters)
    .filter((chapter) => initialSelected.includes(chapter.id) && !selected.has(chapter.id));

  function toggle(ids: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  const sections = outline
    .filter((section) => section.chapters.length > 0)
    .map((section) => {
      const free = section.linkedToAll || locked ? [] : section.chapters.filter((chapter) => !ownedElsewhere(chapter)).map((chapter) => chapter.id);
      const ticked = free.filter((id) => selected.has(id)).length;
      return (
        <fieldset key={section.id} className="rounded-md border border-slate-200">
          <legend className="sr-only">{section.label}</legend>
          {section.linkedToAll || free.length === 0 ? (
            <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 bg-slate-50 px-3 py-2 text-sm font-medium text-ink sm:min-h-9">
              <span className="min-w-0 [overflow-wrap:anywhere]">{section.label}</span>
              {section.linkedToAll && <span className="text-xs font-normal text-slate-600">In every test type</span>}
            </div>
          ) : (
            <SectionCheckbox
              label={section.label}
              state={ticked === 0 ? "none" : ticked === free.length ? "all" : "some"}
              onChange={(on) => toggle(free, on)}
            />
          )}
          <ul className="divide-y divide-slate-100 border-t border-slate-200">
            {section.chapters.map((chapter) => {
              const elsewhere = !section.linkedToAll && ownedElsewhere(chapter);
              const fixed = section.linkedToAll || elsewhere || locked;
              return (
                <li key={chapter.id}>
                  <label
                    className={`flex min-h-10 items-center gap-3 px-3 py-2 text-sm sm:min-h-9 ${fixed ? "" : "cursor-pointer hover:bg-slate-50"}`}
                  >
                    {/* Fixed boxes aren't sent: the server keeps chapters linked to every test type in. */}
                    <input
                      type="checkbox"
                      name={fixed ? undefined : "chapterId"}
                      value={chapter.id}
                      checked={section.linkedToAll || (!elsewhere && selected.has(chapter.id))}
                      disabled={fixed}
                      onChange={(event) => toggle([chapter.id], event.target.checked)}
                      className={checkboxClass}
                    />
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                      <span className="font-mono text-slate-600 tabular-nums">{chapter.number}</span> {chapter.title}
                    </span>
                    {elsewhere && (
                      <span className="shrink-0 text-xs text-slate-600">Belongs to {chapter.owners.map((owner) => owner.name).join(", ")}</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      );
    });

  const count = (
    <p aria-live="polite" className="text-sm text-slate-600">
      {selected.size} of {total} chapter{total === 1 ? "" : "s"} selected
    </p>
  );

  if (locked) {
    return (
      <div>
        <div className="space-y-3 px-5 py-4">
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-ink ring-1 ring-slate-200">
            The structure is locked, so these can&apos;t be changed. Unlock it at the top of the Handbook or Test types page.
          </p>
          {count}
          {sections}
        </div>
        <CloseBar onClose={onClose} />
      </div>
    );
  }

  return (
    <ActionForm
      action={saveTestTypeChapters}
      hidden={{ testTypeId }}
      submitLabel="Save chapters"
      successMessage="Chapters updated."
      onSuccess={onClose}
      onCancel={onClose}
    >
      {count}
      {sections}
      {removed.length > 0 && (
        <p role="status" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong ring-1 ring-warn/25">
          {studying > 0 ? `${countOf(studying, "candidate")} ${studying === 1 ? "studies" : "study"} ${testTypeName}. ` : ""}
          Removing {removed.map((chapter) => `${chapter.number} ${chapter.title}`).join(", ")} takes{" "}
          {removed.length === 1 ? "it" : "them"} out of {testTypeName}&apos;s book, Practice and Mock test
          {studying > 0 ? " for them straight away." : "."}
        </p>
      )}
    </ActionForm>
  );
}

function CloseBar({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex justify-end border-t border-slate-200 px-5 py-3">
      <button type="button" onClick={onClose} className={buttonClass("secondary")}>
        Close
      </button>
    </div>
  );
}

function SectionCheckbox({
  label,
  state,
  onChange,
}: {
  label: string;
  state: "none" | "some" | "all";
  onChange: (on: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);

  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-3 bg-slate-50 px-3 py-2 text-sm font-medium text-ink sm:min-h-9">
      <input
        ref={ref}
        type="checkbox"
        checked={state === "all"}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={`Whole section: ${label}`}
        className={checkboxClass}
      />
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
    </label>
  );
}
