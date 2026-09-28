"use client";

import { useId, type KeyboardEvent } from "react";
import type { AreaChoiceAnswer, AreaChoiceContent, ChoiceArea } from "@/lib/questions/types/area-choice";
import { Icon, pictureWidth } from "./hotspot";
import type { AnswerAreaProps } from "./renderers";

// Candidate answer area for "Choose the area": marked areas on a picture, one of them right.
// With a mouse, an area gets a soft yellow tint as the pointer moves over it; on touch screens every
// area is faintly outlined from the start, since there's nothing to hover with. Real radio buttons
// underneath: Tab to the picture, arrow keys move between areas, Enter checks.
export function AreaChoiceAnswer({ content, media, answer, response, onResponse, onSubmit, locked, showCorrect }: AnswerAreaProps) {
  const name = useId();
  const data = content as AreaChoiceContent;
  const picture = media[data.mediaId];
  const ratio = picture ? picture.width / picture.height : 4 / 3;
  const solution = showCorrect ? (answer as AreaChoiceAnswer | undefined) : undefined;
  const chosen = typeof response === "string" ? response : null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && !locked && chosen && onSubmit) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div>
      <p data-flow-unit className="mb-[0.6em] font-semibold text-ink [break-after:avoid] [break-inside:avoid]">
        Choose an area on the picture.
      </p>

      <div data-flow-unit data-question-picture className="mx-auto [break-inside:avoid]" style={pictureWidth(ratio)}>
        <div
          role="radiogroup"
          aria-label={`${picture?.alt || "Picture"}. Choose one of ${data.areas.length} areas.`}
          onKeyDown={onKeyDown}
          data-area-choice
          className="relative w-full select-none rounded-md bg-slate-100 [-webkit-touch-callout:none]"
        >
          {picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link; files are pre-shrunk WebP
            <img
              src={picture.src}
              alt=""
              width={picture.width}
              height={picture.height}
              draggable={false}
              loading="lazy"
              decoding="async"
              className="pointer-events-none block h-auto w-full rounded-md"
              style={{ aspectRatio: String(ratio) }}
            />
          ) : (
            <span className="grid w-full place-items-center text-[0.85em] text-slate-700" style={{ aspectRatio: String(ratio) }}>
              Picture unavailable
            </span>
          )}
          {data.areas.map((area, index) => (
            <Choice
              key={area.id}
              area={area}
              index={index}
              name={name}
              selected={chosen === area.id}
              locked={locked}
              correct={solution ? solution.correctAreaId === area.id : null}
              label={solution?.label}
              onChoose={() => onResponse(area.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Choice({
  area,
  index,
  name,
  selected,
  locked,
  correct,
  label,
  onChoose,
}: {
  area: ChoiceArea;
  index: number;
  name: string;
  selected: boolean;
  locked: boolean;
  // null until the answer is shown (Handbook after Check or Reveal).
  correct: boolean | null;
  label?: string;
  onChoose: () => void;
}) {
  const wrongChoice = correct === false && selected;
  let tone: string;
  if (correct === true) tone = "border-[3px] border-green-700 bg-green-600/20 shadow-[0_0_0_2px_white]";
  else if (wrongChoice) tone = "border-[3px] border-amber-700 bg-amber-400/25 shadow-[0_0_0_2px_white]";
  else if (selected) tone = "border-[3px] border-primary bg-primary/20 shadow-[0_0_0_2px_white]";
  else
    tone = `border-2 border-transparent [@media(hover:none)]:border-dashed [@media(hover:none)]:border-white [@media(hover:none)]:shadow-[0_0_0_1px_rgba(15,23,42,0.6)] ${
      locked ? "" : "hover:border-amber-500 hover:bg-amber-300/35"
    }`;
  const spoken = area.name || `Area ${index + 1}`;
  const centre = area.x + area.w / 2;
  const vertical = area.y < 8 ? "top-full -translate-y-1/2" : "top-0 -translate-y-1/2";
  const horizontal = centre < 30 ? "left-0" : centre > 70 ? "right-0" : "left-1/2 -translate-x-1/2";

  return (
    <label
      data-choice-area={area.id}
      className={`absolute ${area.shape === "ellipse" ? "rounded-[50%]" : "rounded-sm"} ${tone} ${
        locked ? "cursor-default" : "cursor-pointer"
      } has-[:focus-visible]:bg-amber-300/35 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary`}
      style={{ left: `${area.x}%`, top: `${area.y}%`, width: `${area.w}%`, height: `${area.h}%` }}
    >
      <input type="radio" name={name} value={area.id} checked={selected} disabled={locked} onChange={onChoose} className="sr-only" />
      <span className="sr-only">
        {spoken}
        {correct === true && ". Correct answer"}
        {wrongChoice && ". Your answer"}
      </span>
      {/* Chosen, before any result: a tick in the middle, so it doesn't depend on colour. */}
      {selected && correct === null && (
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 grid size-[max(28px,1.7em)] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-primary text-white shadow-[0_0_0_2px_rgba(15,23,42,0.6)]"
        >
          <Icon name="tick" />
        </span>
      )}
      {(correct === true || wrongChoice) && (
        <span
          aria-hidden="true"
          className={`absolute ${vertical} ${horizontal} flex max-w-[14em] items-center gap-[0.25em] whitespace-nowrap rounded-full px-[0.55em] py-[0.08em] text-[max(14px,0.8em)] font-semibold leading-tight text-white shadow-[0_0_0_2px_white] ${
            correct ? "bg-green-700" : "bg-amber-800"
          }`}
        >
          <Icon name={correct ? "tick" : "cross"} />
          <span className="truncate">{correct ? label || "Correct answer" : "Your answer"}</span>
        </span>
      )}
    </label>
  );
}
