"use client";

import { useEffect, useRef, useState } from "react";
import type { TestAreaOption } from "@/lib/handbook/test-types";
import { labelClass } from "@/components/admin/styles";

const checkboxClass = "size-4 shrink-0 accent-primary";

// Test type checkboxes grouped by test area, each test area with a "whole test area" box.
// Submits one "testTypeId" field per ticked test type.
export function TestTypePicker({
  testAreas,
  initialSelected = [],
  legend,
  hint,
}: {
  testAreas: TestAreaOption[];
  initialSelected?: string[];
  legend?: string;
  hint?: string;
}) {
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const total = testAreas.reduce((sum, testArea) => sum + testArea.testTypes.length, 0);

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

  if (total === 0) {
    return <p className="text-sm text-slate-600">There are no categories yet. Add them on the Categories page.</p>;
  }

  return (
    <fieldset className="space-y-2">
      {legend && <legend className={`${labelClass} mb-1.5`}>{legend}</legend>}
      {hint && <p className="text-sm text-slate-600">{hint}</p>}
      <p aria-live="polite" className="text-sm text-slate-600">
        {selected.size} of {total} categor{total === 1 ? "y" : "ies"} selected
      </p>
      {testAreas
        .filter((testArea) => testArea.testTypes.length > 0)
        .map((testArea) => {
          const ids = testArea.testTypes.map((testType) => testType.id);
          const ticked = ids.filter((id) => selected.has(id)).length;
          return (
            <div key={testArea.id} role="group" aria-label={testArea.label} className="rounded-md border border-slate-200">
              <TestAreaCheckbox
                label={testArea.label}
                state={ticked === 0 ? "none" : ticked === ids.length ? "all" : "some"}
                onChange={(on) => toggle(ids, on)}
              />
              <ul className="divide-y divide-slate-100 border-t border-slate-200">
                {testArea.testTypes.map((testType) => (
                  <li key={testType.id}>
                    <label className="flex min-h-10 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 sm:min-h-9">
                      <input
                        type="checkbox"
                        name="testTypeId"
                        value={testType.id}
                        checked={selected.has(testType.id)}
                        onChange={(event) => toggle([testType.id], event.target.checked)}
                        className={checkboxClass}
                      />
                      <span className="min-w-0 [overflow-wrap:anywhere]">{testType.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
    </fieldset>
  );
}

function TestAreaCheckbox({ label, state, onChange }: { label: string; state: "none" | "some" | "all"; onChange: (on: boolean) => void }) {
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
        aria-label={`Whole group: ${label}`}
        className={checkboxClass}
      />
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
    </label>
  );
}
