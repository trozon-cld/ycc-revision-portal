"use client";

import { useId, useMemo } from "react";
import { seededShuffle } from "@/lib/questions/shuffle";
import type { SinglePictureAnswer as Answer, SinglePictureContent } from "@/lib/questions/types/single-picture";
import { optionLetter } from "@/lib/questions/types/single-text";
import { InlineText } from "../inline-text";
import type { AnswerAreaProps } from "./renderers";

// Candidate answer area for "Single answer, picture options": a 2-per-row grid of picture cards.
// Each card is one large tap target over a real radio button. Pictures sit in same-shape tiles,
// shown whole, so cards line up and the book measures them before the pictures load.
export function SinglePictureAnswer({ mode, seed, content, media, answer, response, onResponse, locked, showCorrect }: AnswerAreaProps) {
  const name = useId();
  const data = content as SinglePictureContent;
  const correctId = showCorrect ? ((answer as Answer | undefined)?.correctOptionId ?? null) : null;

  // The Handbook shows the written order; Practice and Mock shuffle unless the question opts out.
  const options = useMemo(
    () => (mode === "learn" || data.keepOrder ? data.options : seededShuffle(data.options, seed)),
    [data, mode, seed]
  );

  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-[0.6em] p-0">
      {options.map((option, index) => {
        const selected = response === option.id;
        const isCorrect = correctId === option.id;
        const isWrongChoice = correctId !== null && selected && !isCorrect;
        const inputId = `${name}-${option.id}`;
        const picture = media[option.mediaId];

        let tone = "border-slate-300 bg-white";
        if (isCorrect) tone = "border-green-700 bg-green-50";
        else if (isWrongChoice) tone = "border-amber-600 bg-amber-50";
        else if (selected) tone = "border-primary bg-primary/[0.06]";

        return (
          <li key={option.id} data-flow-unit className="min-w-0 [break-inside:avoid]">
            <label
              htmlFor={inputId}
              data-option={option.id}
              className={`flex h-full flex-col gap-[0.4em] rounded-lg border-2 p-[0.4em] text-ink has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${tone} ${
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
              {/* Screen readers hear: "A: picture description, label, result". */}
              <span className="sr-only">{optionLetter(index)}: </span>
              <span className="relative block aspect-[4/3] max-h-(--book-option-picture-max) w-full overflow-hidden rounded-md bg-slate-100">
                {picture ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link; files are pre-shrunk WebP
                  <img src={picture.src} alt={picture.alt} loading="lazy" decoding="async" className="absolute inset-0 size-full object-contain" />
                ) : (
                  <span className="absolute inset-0 grid place-items-center p-[0.4em] text-center text-[0.8em] text-slate-700">
                    Picture unavailable
                  </span>
                )}
                {/* Results sit on the picture, so a card never grows after Check and options never move pages. */}
                {isCorrect && <Status tone="bg-green-700" icon="tick" label="Correct answer" />}
                {isWrongChoice && <Status tone="bg-amber-800" icon="cross" label="Your answer" />}
                {selected && !correctId && (
                  <span aria-hidden="true" className="absolute right-[0.3em] top-[0.3em] grid size-[1.6em] place-items-center rounded-full bg-primary text-white">
                    <Icon name="tick" />
                  </span>
                )}
              </span>
              <span className="flex min-h-[2em] items-start gap-[0.5em] leading-snug">
                <span
                  aria-hidden="true"
                  className={`grid size-[1.8em] shrink-0 place-items-center rounded-full border-2 text-[0.85em] font-bold ${
                    selected ? "border-primary bg-primary text-white" : "border-slate-400 text-slate-700"
                  }`}
                >
                  {optionLetter(index)}
                </span>
                <span className="min-w-0 flex-1 self-center [overflow-wrap:anywhere]">
                  {option.label && <InlineText text={option.label} />}
                  {isCorrect && <span className="sr-only">. Correct answer</span>}
                  {isWrongChoice && <span className="sr-only">. Your answer</span>}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function Status({ tone, icon, label }: { tone: string; icon: "tick" | "cross"; label: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute inset-x-[0.3em] bottom-[0.3em] flex items-center gap-[0.3em] rounded-md px-[0.4em] py-[0.2em] text-[max(14px,0.8em)] font-semibold leading-tight text-white ${tone}`}
    >
      <Icon name={icon} />
      {label}
    </span>
  );
}

function Icon({ name }: { name: "tick" | "cross" }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-[1.1em] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      {name === "tick" ? <path d="M4 10.5l4 4 8-9" /> : <path d="M5 5l10 10M15 5L5 15" />}
    </svg>
  );
}
