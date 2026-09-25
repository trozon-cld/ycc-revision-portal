"use client";

import { useId, useMemo } from "react";
import { seededShuffle } from "@/lib/questions/shuffle";
import { choosePrompt, type MultiPickAnswer as Answer, type MultiPickContent } from "@/lib/questions/types/multi-pick";
import { optionLetter } from "@/lib/questions/types/single-text";
import { InlineText } from "../inline-text";
import type { AnswerAreaProps } from "./renderers";

// Candidate answer area for "Multiple answers": choose exactly N. Real checkboxes underneath; square
// badges (not round) signal "more than one". Choosing more than N is blocked with a note. Practice and
// Mock on wide screens also show N answer slots that fill as options are chosen.
export function MultiPickAnswer({ mode, seed, content, answer, response, onResponse, onNotice, locked, showCorrect }: AnswerAreaProps) {
  const name = useId();
  const data = content as MultiPickContent;
  const chosen = Array.isArray(response) ? (response as string[]) : [];
  const correctIds = showCorrect ? ((answer as Answer | undefined)?.correctOptionIds ?? []) : [];

  // The Handbook shows the written order; Practice and Mock shuffle unless the question opts out.
  const options = useMemo(
    () => (mode === "learn" || data.keepOrder ? data.options : seededShuffle(data.options, seed)),
    [data, mode, seed]
  );
  const letterOf = (id: string) => optionLetter(options.findIndex((option) => option.id === id));

  function toggle(id: string) {
    if (locked) return;
    if (chosen.includes(id)) {
      const next = chosen.filter((item) => item !== id);
      onResponse(next.length ? next : null);
    } else if (chosen.length >= data.pick) {
      onNotice(`You've chosen ${data.pick}. Tap one to remove it first.`);
    } else {
      onResponse([...chosen, id]);
    }
  }

  return (
    <div className="@container">
      <p data-flow-unit className="mb-[0.6em] font-semibold text-ink [break-after:avoid] [break-inside:avoid]">
        {choosePrompt(data.pick)}
        <span className="font-normal text-slate-700"> · {chosen.length} of {data.pick} chosen</span>
      </p>

      {mode !== "learn" && (
        // Answer slots mirror the test's drag-into-boxes look; only on wide Practice/Mock screens.
        <div data-flow-unit className="mb-[0.6em] hidden gap-[0.5em] @xl:grid" style={{ gridTemplateColumns: `repeat(${data.pick}, minmax(0, 1fr))` }}>
          {Array.from({ length: data.pick }, (_, slot) => {
            const id = chosen[slot];
            const option = id ? data.options.find((item) => item.id === id) : undefined;
            return option ? (
              <button
                key={slot}
                type="button"
                onClick={() => toggle(option.id)}
                disabled={locked}
                className="flex min-h-[max(56px,3.5em)] items-center gap-[0.5em] rounded-lg border-2 border-primary bg-primary/[0.06] px-[0.7em] py-[0.4em] text-left text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default"
              >
                <span aria-hidden="true" className="grid size-[1.8em] shrink-0 place-items-center rounded-md bg-primary text-[0.85em] font-bold text-white">
                  {letterOf(option.id)}
                </span>
                <span className="line-clamp-2 min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <InlineText text={option.text} />
                </span>
                {!locked && <span className="sr-only">(remove answer {slot + 1})</span>}
              </button>
            ) : (
              <div
                key={slot}
                className="flex min-h-[max(56px,3.5em)] items-center justify-center rounded-lg border-2 border-dashed border-slate-400 px-[0.7em] text-slate-700"
              >
                Answer {slot + 1}
              </div>
            );
          })}
        </div>
      )}

      <ul className="m-0 list-none space-y-[max(0.6em,10px)] p-0">
        {options.map((option, index) => {
          const selected = chosen.includes(option.id);
          const isCorrect = correctIds.includes(option.id);
          const isWrongChoice = showCorrect && selected && !isCorrect;
          const inputId = `${name}-${option.id}`;

          let tone = "border-slate-300 bg-white";
          if (isCorrect) tone = "border-green-700 bg-green-50";
          else if (isWrongChoice) tone = "border-amber-600 bg-amber-50";
          else if (selected) tone = "border-primary bg-primary/[0.06]";

          return (
            <li key={option.id} data-flow-unit className="[break-inside:avoid]">
              <label
                htmlFor={inputId}
                data-option={option.id}
                className={`relative flex min-h-[max(56px,3.5em)] items-center gap-[0.75em] rounded-lg border-2 px-[0.9em] py-[0.55em] leading-snug text-ink has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${tone} ${
                  locked ? "cursor-default" : "cursor-pointer hover:border-primary"
                }`}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  name={name}
                  value={option.id}
                  checked={selected}
                  disabled={locked}
                  onChange={() => toggle(option.id)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`grid size-[2em] shrink-0 place-items-center rounded-md border-2 text-[0.9em] font-bold ${
                    selected ? "border-primary bg-primary text-white" : "border-slate-400 text-slate-700"
                  }`}
                >
                  {optionLetter(index)}
                </span>
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="sr-only">{optionLetter(index)}: </span>
                  <InlineText text={option.text} />
                  {isCorrect && <span className="sr-only">. Correct answer</span>}
                  {isWrongChoice && <span className="sr-only">. Your answer</span>}
                </span>
                {selected && !showCorrect && <Icon name="tick" className="text-primary" />}
                {/* Results sit on the border, so an option never grows after Check and never moves page. */}
                {isCorrect && <Status tone="bg-green-700" icon="tick" label="Correct answer" />}
                {isWrongChoice && <Status tone="bg-amber-800" icon="cross" label="Your answer" />}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Status({ tone, icon, label }: { tone: string; icon: "tick" | "cross"; label: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute -top-[0.65em] right-[0.75em] flex items-center gap-[0.25em] rounded-full px-[0.55em] py-[0.08em] text-[max(14px,0.8em)] font-semibold leading-tight text-white ${tone}`}
    >
      <Icon name={icon} />
      {label}
    </span>
  );
}

function Icon({ name, className = "" }: { name: "tick" | "cross"; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`size-[1.2em] shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "tick" ? <path d="M4 10.5l4 4 8-9" /> : <path d="M5 5l10 10M15 5L5 15" />}
    </svg>
  );
}
