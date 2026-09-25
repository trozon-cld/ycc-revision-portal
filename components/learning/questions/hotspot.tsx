"use client";

import { type KeyboardEvent, type MouseEvent } from "react";
import { roundTenth, type HotspotAnswer, type HotspotArea, type HotspotContent, type HotspotPoint } from "@/lib/questions/types/hotspot";
import type { AnswerAreaProps } from "./renderers";

const STEP = 2;
// Taps need room: the picture is at least this wide (or as wide as the page allows); if the
// question doesn't fit on one book page at that size, it continues on the next page.
const MIN_WIDTH = 300;
const BIG_STEP = 10;

function readPoint(value: unknown): HotspotPoint | null {
  if (typeof value !== "object" || value === null) return null;
  const { x, y } = value as Record<string, unknown>;
  return typeof x === "number" && typeof y === "number" ? { x, y } : null;
}

const clamp = (value: number) => Math.min(100, Math.max(0, roundTenth(value)));

// Candidate answer area for "Tap the area": one marker on the picture. Tap to place or move it;
// keyboard users move it with the arrow keys and check with Enter. Results are drawn over the
// picture, so nothing changes height after Check and nothing moves page in the book.
export function HotspotAnswer({ content, media, answer, response, onResponse, onSubmit, locked, showCorrect, result }: AnswerAreaProps) {
  const data = content as HotspotContent;
  const picture = media[data.mediaId];
  const ratio = picture ? picture.width / picture.height : 4 / 3;
  const point = readPoint(response);
  const solution = showCorrect ? (answer as HotspotAnswer | undefined) : undefined;
  const areas = solution?.areas ?? [];
  const marked = showCorrect && result ? (result.correct ? "right" : "wrong") : null;

  function place(event: MouseEvent<HTMLDivElement>) {
    if (locked) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    onResponse({ x: clamp(((event.clientX - box.left) / box.width) * 100), y: clamp(((event.clientY - box.top) / box.height) * 100) });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[event.key];
    if (move) {
      // Arrow keys belong to the marker here, not to the book's page turning.
      event.preventDefault();
      event.stopPropagation();
      if (locked) return;
      const step = event.shiftKey ? BIG_STEP : STEP;
      // The first press puts the marker in the middle; later presses move it.
      onResponse(point ? { x: clamp(point.x + move[0] * step), y: clamp(point.y + move[1] * step) } : { x: 50, y: 50 });
    } else if (event.key === "Enter" && !locked && point && onSubmit) {
      event.preventDefault();
      onSubmit();
    }
  }

  const instructions = `Tap the picture, or use the arrow keys to move the marker${onSubmit ? " and Enter to check your answer" : ""}.`;

  return (
    <div>
      <p data-flow-unit className="mb-[0.6em] font-semibold text-ink [break-after:avoid] [break-inside:avoid]">
        Tap the picture to answer.
      </p>

      <div data-flow-unit data-question-picture className="mx-auto [break-inside:avoid]" style={pictureWidth(ratio)}>
        <div
          role="application"
          aria-roledescription="picture to tap"
          aria-label={`${picture?.alt || "Picture"}. ${locked ? "" : instructions}`}
          aria-disabled={locked || undefined}
          tabIndex={locked ? -1 : 0}
          onClick={place}
          onKeyDown={onKeyDown}
          data-hotspot-picture
          className={`relative w-full select-none rounded-md bg-slate-100 [-webkit-touch-callout:none] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary ${
            locked ? "cursor-default" : "cursor-crosshair"
          }`}
        >
          {/* An in-flow picture can't be split across book pages; the markers sit on top of it. */}
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
          {areas.map((area) => (
            <AreaOutline key={area.id} area={area} label={solution?.label} />
          ))}
          {point && <Marker point={point} marked={marked} />}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {point ? `Your marker is ${Math.round(point.x)}% across and ${Math.round(point.y)}% down the picture.` : ""}
        {showCorrect &&
          ` The correct ${areas.length > 1 ? "areas are" : "area is"} outlined on the picture${solution?.label ? `: ${solution.label}` : ""}.`}
      </p>
    </div>
  );
}

function pictureWidth(ratio: number) {
  const r = ratio.toFixed(4);
  const fitted = `calc(var(--book-picture-max, 60vh) * ${r})`;
  const usable = `min(${MIN_WIDTH}px, calc(var(--book-picture-share, 60vh) * ${r}))`;
  return { width: `min(100%, max(${fitted}, ${usable}))` };
}

function AreaOutline({ area, label }: { area: HotspotArea; label?: string }) {
  const centre = area.x + area.w / 2;
  // The tag straddles the area's top edge, or its bottom edge when the area touches the top.
  const vertical = area.y < 8 ? "top-full -translate-y-1/2" : "top-0 -translate-y-1/2";
  const horizontal = centre < 30 ? "left-0" : centre > 70 ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span
      aria-hidden="true"
      data-hotspot-area
      className={`pointer-events-none absolute border-[3px] border-green-700 bg-green-600/15 shadow-[0_0_0_2px_white] ${
        area.shape === "ellipse" ? "rounded-[50%]" : "rounded-sm"
      }`}
      style={{ left: `${area.x}%`, top: `${area.y}%`, width: `${area.w}%`, height: `${area.h}%` }}
    >
      <span
        className={`absolute ${vertical} ${horizontal} flex max-w-[14em] items-center gap-[0.25em] whitespace-nowrap rounded-full bg-green-700 px-[0.55em] py-[0.08em] text-[max(14px,0.8em)] font-semibold leading-tight text-white shadow-[0_0_0_2px_white]`}
      >
        <Icon name="tick" />
        <span className="truncate">{label || "Correct area"}</span>
      </span>
    </span>
  );
}

function Marker({ point, marked }: { point: HotspotPoint; marked: "right" | "wrong" | null }) {
  const tone = marked === "right" ? "bg-green-700" : marked === "wrong" ? "bg-amber-800" : "bg-primary";
  return (
    <span
      aria-hidden="true"
      data-hotspot-marker
      className={`pointer-events-none absolute grid size-[max(32px,2em)] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-white text-white shadow-[0_0_0_2px_rgba(15,23,42,0.85)] ${tone}`}
      style={{ left: `${point.x}%`, top: `${point.y}%` }}
    >
      {marked ? <Icon name={marked === "right" ? "tick" : "cross"} /> : <span className="size-[0.45em] rounded-full bg-white" />}
    </span>
  );
}

function Icon({ name }: { name: "tick" | "cross" }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-[1.1em] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {name === "tick" ? <path d="M4 10.5l4 4 8-9" /> : <path d="M5 5l10 10M15 5L5 15" />}
    </svg>
  );
}
