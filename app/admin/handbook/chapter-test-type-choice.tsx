"use client";

import { useState } from "react";
import type { TestAreaOption } from "@/lib/handbook/test-types";
import { labelClass } from "@/components/admin/styles";
import { countOf } from "@/lib/format";

// A chapter's section decides its test types: linked to every test type (A–D), or one test type at most (E).
export type ChapterLinking = { label: string; linkedToAll: boolean };

const radioClass = "size-4 shrink-0 accent-primary disabled:opacity-60";

// Submits one "testTypeId" field: a test type's id, or empty for none.
export function ChapterTestTypeChoice({
  testAreas,
  linking,
  initialSelected = [],
  chapterName,
  readOnly = false,
}: {
  testAreas: TestAreaOption[];
  // Null until a new chapter's section is chosen.
  linking: ChapterLinking | null;
  initialSelected?: string[];
  chapterName?: string;
  readOnly?: boolean;
}) {
  const [choice, setChoice] = useState(initialSelected.length === 1 ? initialSelected[0] : initialSelected.length === 0 ? "" : null);
  const testTypes = testAreas.flatMap((testArea) => testArea.testTypes);

  if (testTypes.length === 0) {
    return <p className="text-sm text-slate-600">There are no test types yet. Add them on the Test types page.</p>;
  }
  if (!linking) return <p className="text-sm text-slate-600">Choose a section to see which test types the chapter can be in.</p>;
  if (linking.linkedToAll) {
    return (
      <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-ink ring-1 ring-slate-200">
        Chapters in {linking.label} are in every test type&apos;s book, so {chapterName ? "this chapter is" : "it will be"} in all{" "}
        {countOf(testTypes.length, "test type")}.
      </p>
    );
  }

  const owner = initialSelected.length === 1 ? testTypes.find((testType) => testType.id === initialSelected[0]) : undefined;
  const leaving = owner && choice !== null && choice !== owner.id && owner.studying > 0;
  const name = readOnly ? undefined : "testTypeId";

  return (
    <fieldset className="space-y-2">
      <legend className={`${labelClass} mb-1.5`}>Test type</legend>
      <p className="text-sm text-slate-600">
        A chapter in {linking.label} can be in one test type only. Candidates studying it see the chapter in Prepare, Practice and
        the Mock test once it&apos;s published.
      </p>
      {initialSelected.length > 1 && (
        <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong ring-1 ring-warn/25">
          This chapter is in {countOf(initialSelected.length, "test type")} at the moment.{readOnly ? "" : " Choose the one it belongs to."}
        </p>
      )}
      <div className="rounded-md border border-slate-200">
        <label className={`flex min-h-10 items-center gap-3 bg-slate-50 px-3 py-2 text-sm sm:min-h-9 ${readOnly ? "" : "cursor-pointer"}`}>
          <input
            type="radio"
            name={name}
            value=""
            required
            checked={choice === ""}
            disabled={readOnly}
            onChange={() => setChoice("")}
            className={radioClass}
          />
          <span>No test type</span>
        </label>
        {testAreas
          .filter((testArea) => testArea.testTypes.length > 0)
          .map((testArea) => (
            <div key={testArea.id} role="group" aria-label={testArea.label} className="border-t border-slate-200">
              <p className="bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">{testArea.label}</p>
              <ul className="divide-y divide-slate-100">
                {testArea.testTypes.map((testType) => (
                  <li key={testType.id}>
                    <label className={`flex min-h-10 items-center gap-3 px-3 py-2 text-sm sm:min-h-9 ${readOnly ? "" : "cursor-pointer hover:bg-slate-50"}`}>
                      <input
                        type="radio"
                        name={name}
                        value={testType.id}
                        checked={readOnly ? initialSelected.includes(testType.id) : choice === testType.id}
                        disabled={readOnly}
                        onChange={() => setChoice(testType.id)}
                        className={radioClass}
                      />
                      <span className="min-w-0 [overflow-wrap:anywhere]">{testType.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
      {leaving && (
        <p role="status" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong ring-1 ring-warn/25">
          {countOf(owner.studying, "candidate")} {owner.studying === 1 ? "studies" : "study"} {owner.name}. Moving{" "}
          {chapterName ?? "this chapter"} out of it takes it out of their book, Practice and Mock test straight away.
        </p>
      )}
    </fieldset>
  );
}
