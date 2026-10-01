"use client";

import { useActionState, useState } from "react";
import { PRACTICE_SIZES, type PracticeOptions, type PracticeWay } from "@/lib/practice/types";
import { CHOICE_INPUT, CHOICE_ROW, PRIMARY_BUTTON } from "@/components/candidate/buttons";
import { startPracticeForm, type StartState } from "./actions";

const WAYS: { way: PracticeWay; title: string; description: string }[] = [
  { way: "smart", title: "Smart practice", description: "A mix chosen for you: questions you haven’t practised yet first, then ones you got wrong." },
  { way: "chapters", title: "By chapter", description: "Choose one or more chapters." },
  { way: "types", title: "By question type", description: "Choose one or more kinds of question." },
  { way: "all", title: "All questions", description: "Questions from every chapter, in a random order." },
];

const plural = (count: number) => `${count} question${count === 1 ? "" : "s"}`;

export function PracticeSetup({ options, hasOpen }: { options: PracticeOptions; hasOpen: boolean }) {
  const [state, action, pending] = useActionState<StartState, FormData>(startPracticeForm, { error: null });
  const [way, setWay] = useState<PracticeWay>("smart");
  const [chapters, setChapters] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [size, setSize] = useState<string>(String(PRACTICE_SIZES[0]));

  const chapterCounts = new Map(options.sections.flatMap((section) => section.chapters.map((chapter) => [chapter.id, chapter.count] as const)));
  const typeCounts = new Map(options.types.map((item) => [item.type as string, item.count]));
  const available =
    way === "chapters"
      ? chapters.reduce((sum, id) => sum + (chapterCounts.get(id) ?? 0), 0)
      : way === "types"
        ? types.reduce((sum, type) => sum + (typeCounts.get(type) ?? 0), 0)
        : options.total;
  // A size bigger than what's available becomes "All".
  const chosenSize = size !== "all" && Number(size) > available ? "all" : size;
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  return (
    <form action={action} className="mt-8">
      <fieldset>
        <legend className="mb-3 text-xl font-bold text-ink">1. What would you like to practise?</legend>
        <div className="flex flex-col gap-3">
          {WAYS.map((item) => (
            <label key={item.way} className={CHOICE_ROW}>
              <input type="radio" name="way" value={item.way} checked={way === item.way} onChange={() => setWay(item.way)} className={CHOICE_INPUT} />
              <span className="flex min-w-0 flex-col">
                <span className="text-lg font-semibold text-ink">{item.title}</span>
                <span className="text-base text-ink/80">
                  {item.description}
                  {item.way === "all" && ` ${plural(options.total)}.`}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {way === "chapters" && (
        <fieldset className="mt-6">
          <legend className="mb-3 text-xl font-bold text-ink">Choose chapters</legend>
          <div className="flex flex-col gap-5">
            {options.sections.map((section) => (
              <div key={section.label}>
                <p className="mb-2 text-base font-semibold text-ink/80 [overflow-wrap:anywhere]">{section.label}</p>
                <div className="flex flex-col gap-3">
                  {section.chapters.map((chapter) => (
                    <label key={chapter.id} className={CHOICE_ROW}>
                      <input
                        type="checkbox"
                        name="chapter"
                        value={chapter.id}
                        checked={chapters.includes(chapter.id)}
                        onChange={() => setChapters((list) => toggle(list, chapter.id))}
                        className={CHOICE_INPUT}
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-lg font-semibold text-ink [overflow-wrap:anywhere]">{chapter.label}</span>
                        <span className="text-base text-ink/80">{plural(chapter.count)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      {way === "types" && (
        <fieldset className="mt-6">
          <legend className="mb-3 text-xl font-bold text-ink">Choose types of question</legend>
          <div className="flex flex-col gap-3">
            {options.types.map((item) => (
              <label key={item.type} className={CHOICE_ROW}>
                <input
                  type="checkbox"
                  name="type"
                  value={item.type}
                  checked={types.includes(item.type)}
                  onChange={() => setTypes((list) => toggle(list, item.type))}
                  className={CHOICE_INPUT}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-lg font-semibold text-ink">{item.name}</span>
                  <span className="text-base text-ink/80">{plural(item.count)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="mt-8">
        <legend className="mb-3 text-xl font-bold text-ink">2. How many questions?</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PRACTICE_SIZES.map((value) => (
            <label key={value} className={`${CHOICE_ROW} justify-center`}>
              <input
                type="radio"
                name="size"
                value={value}
                checked={chosenSize === String(value)}
                disabled={value > available}
                onChange={() => setSize(String(value))}
                className={CHOICE_INPUT}
              />
              <span className="text-lg font-semibold">{value}</span>
            </label>
          ))}
          <label className={`${CHOICE_ROW} justify-center`}>
            <input type="radio" name="size" value="all" checked={chosenSize === "all"} onChange={() => setSize("all")} className={CHOICE_INPUT} />
            <span className="text-lg font-semibold">All{available > 0 ? ` (${available})` : ""}</span>
          </label>
        </div>
      </fieldset>

      <div aria-live="polite" className="mt-6">
        {state.error && (
          <p role="alert" className="rounded-xl border-2 border-red-700 bg-red-50 p-4 text-lg font-semibold text-red-800">
            {state.error}
          </p>
        )}
      </div>

      <button type="submit" disabled={pending} className={`${PRIMARY_BUTTON} mt-2 w-full sm:w-auto`}>
        {pending ? "Starting…" : hasOpen ? "Start a new practice" : "Start practice"}
      </button>
    </form>
  );
}
