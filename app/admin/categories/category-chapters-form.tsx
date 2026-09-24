"use client";

import { useEffect, useRef, useState } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { buttonClass } from "@/components/admin/styles";
import { saveCategoryChapters } from "./actions";

export type ChapterOutline = {
  id: string;
  label: string;
  chapters: { id: string; number: string; title: string }[];
}[];

const checkboxClass = "size-4 shrink-0 accent-primary";

export function CategoryChaptersForm({
  categoryId,
  outline,
  initialSelected,
  onClose,
}: {
  categoryId: string;
  outline: ChapterOutline;
  initialSelected: string[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const total = outline.reduce((sum, section) => sum + section.chapters.length, 0);

  if (total === 0) {
    return (
      <div>
        <p className="px-5 py-4 text-sm">There are no chapters yet. Add them on the Handbook page first.</p>
        <div className="flex justify-end border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose} className={buttonClass("secondary")}>
            Close
          </button>
        </div>
      </div>
    );
  }

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

  return (
    <ActionForm
      action={saveCategoryChapters}
      hidden={{ categoryId }}
      submitLabel="Save chapters"
      successMessage="Chapters saved."
      onSuccess={onClose}
      onCancel={onClose}
    >
      <p aria-live="polite" className="text-sm text-slate-600">
        {selected.size} of {total} chapter{total === 1 ? "" : "s"} selected
      </p>

      {outline
        .filter((section) => section.chapters.length > 0)
        .map((section) => {
          const ids = section.chapters.map((chapter) => chapter.id);
          const ticked = ids.filter((id) => selected.has(id)).length;
          return (
            <fieldset key={section.id} className="rounded-md border border-slate-200">
              <legend className="sr-only">{section.label}</legend>
              <SectionCheckbox
                label={section.label}
                state={ticked === 0 ? "none" : ticked === ids.length ? "all" : "some"}
                onChange={(on) => toggle(ids, on)}
              />
              <ul className="divide-y divide-slate-100 border-t border-slate-200">
                {section.chapters.map((chapter) => (
                  <li key={chapter.id}>
                    <label className="flex min-h-10 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 sm:min-h-9">
                      <input
                        type="checkbox"
                        name="chapterId"
                        value={chapter.id}
                        checked={selected.has(chapter.id)}
                        onChange={(event) => toggle([chapter.id], event.target.checked)}
                        className={checkboxClass}
                      />
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        <span className="font-mono text-slate-600 tabular-nums">{chapter.number}</span> {chapter.title}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        })}
    </ActionForm>
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
