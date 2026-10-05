"use client";

import { useId, useMemo } from "react";
import { seededShuffle } from "@/lib/questions/shuffle";
import { optionLetter, type SingleTextAnswer as Answer, type SingleTextContent } from "@/lib/questions/types/single-text";
import { InlineText } from "../inline-text";
import { MarkIcon, OptionStatus } from "./answer-parts";
import type { AnswerAreaProps } from "./renderers";

// Candidate answer area for "Single answer, text options". Real radio buttons underneath, so arrow
// keys and screen readers work; every state has an icon or word as well as a colour.
export function SingleTextAnswer({ mode, seed, content, answer, response, onResponse, locked, showCorrect }: AnswerAreaProps) {
  const name = useId();
  const data = content as SingleTextContent;
  const correctId = showCorrect ? ((answer as Answer | undefined)?.correctOptionId ?? null) : null;

  // The Handbook shows the written order; Practice and Mock shuffle unless the question opts out.
  const options = useMemo(
    () => (mode === "learn" || data.keepOrder ? data.options : seededShuffle(data.options, seed)),
    [data, mode, seed]
  );

  return (
    <ul className="m-0 list-none space-y-[max(0.6em,10px)] p-0">
      {options.map((option, index) => {
        const selected = response === option.id;
        const isCorrect = correctId === option.id;
        const isWrongChoice = correctId !== null && selected && !isCorrect;
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
              className={`relative flex min-h-[max(var(--answer-min-h,56px),var(--answer-min-em,3.5em))] items-center gap-[0.75em] rounded-lg border-2 px-[0.9em] py-[calc(0.55em*var(--q-space,1))] leading-snug text-ink has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${tone} ${
                locked ? "cursor-default" : "cursor-pointer hover:border-primary"
              }`}
            >
              <input
                id={inputId}
                type="radio"
                name={name}
                value={option.id}
                checked={selected}
                disabled={locked}
                onChange={() => onResponse(option.id)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={`grid size-[2em] shrink-0 place-items-center rounded-full border-2 text-[0.9em] font-bold ${
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
              {selected && !isCorrect && !isWrongChoice && <MarkIcon name="tick" className="size-[1.2em] shrink-0 text-primary" />}
              {/* Results sit on the border, so an option never grows after Check and never moves page. */}
              {isCorrect && <OptionStatus tone="bg-green-700" icon="tick" label="Correct answer" />}
              {isWrongChoice && <OptionStatus tone="bg-amber-800" icon="cross" label="Your answer" />}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
