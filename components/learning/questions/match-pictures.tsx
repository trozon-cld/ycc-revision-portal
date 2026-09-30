"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import type { ResolvedMedia } from "@/lib/content/book";
import { seededShuffle } from "@/lib/questions/shuffle";
import type { MatchAnswer, MatchContent, MatchItem, MatchResponse } from "@/lib/questions/types/match-pictures";
import { Icon } from "./hotspot";
import type { AnswerAreaProps } from "./renderers";
import { usePictureSrc } from "../measuring";

// Past this distance a press on a picture becomes a drag; anything shorter is a tap.
const DRAG_START = 6;

type Drag = { itemId: string | null; x: number; y: number; moved: boolean; startX: number; startY: number; onTap: () => void };

// Candidate answer area for "Match pictures": put each picture in the box with its label.
// Three ways, all equal: drag a picture onto a box (mouse or finger); tap a picture, then a box;
// or Tab to a picture, Enter, Tab to a box, Enter. A filled box sends its picture back when tapped.
export function MatchPicturesAnswer({
  mode,
  seed,
  content,
  media,
  answer,
  response,
  onResponse,
  onNotice,
  locked,
  showCorrect,
  selection: selected,
  onSelection: setSelected,
}: AnswerAreaProps) {
  const data = content as MatchContent;
  const placed = useMemo(() => (response && typeof response === "object" ? (response as MatchResponse) : {}), [response]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // Set when a press was handled from pointer events, so the click that may follow isn't counted twice.
  // Any key press or new press clears it, so keyboard clicks always count.
  const pointerHandled = useRef(false);
  const solution = showCorrect ? (answer as MatchAnswer | undefined) : undefined;
  const rightFor = (targetId: string) => solution?.matches.find((match) => match.targetId === targetId)?.itemId;

  // Pictures are always shuffled (with a fixed seed), so their order never hints at the answer.
  const items = useMemo(() => seededShuffle(data.items, seed), [data.items, seed]);
  const boxOf = (itemId: string) => Object.keys(placed).find((targetId) => placed[targetId] === itemId) ?? null;
  const itemById = (itemId: string | undefined) => data.items.find((item) => item.id === itemId);
  const alt = (item: MatchItem | undefined) => (item ? media[item.mediaId]?.alt || "Picture" : "");

  function commit(next: MatchResponse) {
    onResponse(Object.keys(next).length ? next : null);
  }

  // Puts a picture in a box. If the box already has one, they swap (or it goes back to the pictures).
  function place(itemId: string, targetId: string) {
    const next = { ...placed };
    const from = boxOf(itemId);
    const previous = next[targetId];
    if (from) delete next[from];
    next[targetId] = itemId;
    if (previous && previous !== itemId && from) next[from] = previous;
    // A new answer also clears the picked-up picture (see QuestionView).
    commit(next);
  }

  function returnToPictures(itemId: string) {
    const from = boxOf(itemId);
    if (!from) return;
    const next = { ...placed };
    delete next[from];
    commit(next);
  }

  function tapPicture(itemId: string) {
    if (locked) return;
    setSelected(selected === itemId ? null : itemId);
  }

  function tapBox(targetId: string) {
    if (locked) return;
    if (selected) place(selected, targetId);
    else if (placed[targetId]) returnToPictures(placed[targetId]);
    else onNotice("Tap a picture first, then its box.");
  }

  // Pointer presses: a short press is a tap (handled here, as some touch screens send no click after it);
  // past DRAG_START it's a drag that follows the pointer with a copy of the picture.
  function onPointerDown(event: ReactPointerEvent<HTMLElement>, itemId: string | null, onTap: () => void) {
    pointerHandled.current = false;
    if (locked || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ itemId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, onTap });
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!drag || !drag.itemId) return;
    const moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > DRAG_START;
    setDrag({ ...drag, x: event.clientX, y: event.clientY, moved });
    if (moved) setOver(dropTargetAt(event.clientX, event.clientY));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (!drag) return;
    pointerHandled.current = true;
    if (drag.moved && drag.itemId) {
      const target = dropTargetAt(event.clientX, event.clientY);
      if (target === "pictures") returnToPictures(drag.itemId);
      else if (target) place(drag.itemId, target);
    } else drag.onTap();
    setDrag(null);
    setOver(null);
  }

  // Clicks without a pointer press first: keyboard (Enter, Space) and screen readers.
  const onClickGuard = (action: () => void) => () => {
    if (pointerHandled.current) {
      pointerHandled.current = false;
      return;
    }
    action();
  };
  const onKeyDownAny = () => (pointerHandled.current = false);

  const dragged = drag?.moved && drag.itemId ? itemById(drag.itemId) : undefined;

  return (
    <div className="@container" data-no-swipe>
      <p data-flow-unit className="mb-[0.6em] font-semibold text-ink [break-after:avoid] [break-inside:avoid]">
        Put each picture in the box it belongs to.
        <span className="block font-normal text-slate-700">Drag it, or tap a picture and then a box.</span>
      </p>

      <div className="@2xl:grid @2xl:grid-cols-[auto_1fr] @2xl:items-start @2xl:gap-[1.5em]">
        <ul
          data-flow-unit
          data-match-pictures
          aria-label="Pictures to place"
          className={`m-0 mb-[0.8em] flex list-none flex-wrap gap-[0.5em] rounded-lg p-[0.3em] [break-inside:avoid] @2xl:flex-col ${
            over === "pictures" ? "bg-primary/[0.08] ring-2 ring-primary" : ""
          }`}
        >
          {items.map((item) => {
            const inBox = boxOf(item.id);
            return (
              <li key={item.id} className="size-[max(64px,4.5em)] shrink-0 [break-inside:avoid]">
                {/* inline-block: never split across book pages, like the button it stands in for. */}
                {inBox ? (
                  <span aria-hidden="true" className="inline-block size-full rounded-md border-2 border-dashed border-slate-300 align-top" />
                ) : (
                  <button
                    type="button"
                    data-match-item={item.id}
                    aria-pressed={selected === item.id}
                    aria-label={alt(item)}
                    disabled={locked}
                    onPointerDown={(event) => onPointerDown(event, item.id, () => tapPicture(item.id))}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => setDrag(null)}
                    onClick={onClickGuard(() => tapPicture(item.id))}
                    onKeyDown={(event) => {
                      onKeyDownAny();
                      if (event.key === "Escape") setSelected(null);
                    }}
                    className={`relative block size-full touch-none rounded-md border-2 bg-white p-[0.2em] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default ${
                      selected === item.id ? "border-primary ring-4 ring-primary/40" : "border-slate-300 hover:border-primary"
                    } ${drag?.moved && drag.itemId === item.id ? "opacity-40" : ""} ${locked ? "" : "cursor-grab"}`}
                  >
                    <Picture media={media} item={item} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <ul className="m-0 list-none space-y-[max(0.6em,10px)] p-0">
          {data.targets.map((target) => {
            const inside = itemById(placed[target.id]);
            const right = rightFor(target.id);
            const isRight = Boolean(solution && inside && inside.id === right);
            const isWrong = Boolean(solution && inside && inside.id !== right);
            let tone = "border-slate-300 bg-white";
            if (isRight) tone = "border-green-700 bg-green-50";
            else if (isWrong) tone = "border-amber-600 bg-amber-50";
            else if (over === target.id) tone = "border-primary bg-primary/[0.08]";
            return (
              <li key={target.id} data-flow-unit className="[break-inside:avoid]">
                <div className={`relative flex items-center gap-[0.75em] rounded-lg border-2 p-[0.35em] ${tone}`}>
                  <button
                    type="button"
                    data-match-box={target.id}
                    aria-label={`${target.label}: ${inside ? alt(inside) : "empty"}${selected ? ". Place the chosen picture here" : ""}${
                      isRight ? ". Correct" : isWrong ? ". Not this one" : ""
                    }`}
                    disabled={locked}
                    onPointerDown={(event) => onPointerDown(event, inside?.id ?? null, () => tapBox(target.id))}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => setDrag(null)}
                    onClick={onClickGuard(() => tapBox(target.id))}
                    onKeyDown={onKeyDownAny}
                    className={`relative grid size-[max(64px,4.5em)] shrink-0 touch-none place-items-center rounded-md border-2 p-[0.2em] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default ${
                      inside ? "border-slate-300 bg-white" : "border-dashed border-slate-400 bg-slate-100"
                    } ${selected && !locked ? "border-primary" : ""}`}
                  >
                    {inside && <Picture media={media} item={inside} />}
                  </button>
                  <span className="min-w-0 flex-1 font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{target.label}</span>
                  {/* Room for the right picture is kept in the Handbook, so nothing moves after Check. */}
                  {mode === "learn" ? (
                    <span className="grid size-[max(40px,2.6em)] shrink-0 place-items-center">
                      {right && right !== inside?.id && (
                        <span className="relative block size-full rounded-md border-2 border-green-700 bg-white p-[0.1em]" title="Right picture">
                          <Picture media={media} item={itemById(right)} />
                          <span className="sr-only">Right picture: {alt(itemById(right))}</span>
                          <span aria-hidden="true" className="absolute -right-[0.4em] -top-[0.4em] grid size-[1.3em] place-items-center rounded-full bg-green-700 text-[0.8em] text-white">
                            <Icon name="tick" />
                          </span>
                        </span>
                      )}
                    </span>
                  ) : null}
                  {(isRight || isWrong) && (
                    <span
                      aria-hidden="true"
                      className={`absolute -top-[0.65em] right-[0.75em] flex items-center gap-[0.25em] rounded-full px-[0.55em] py-[0.08em] text-[max(14px,0.8em)] font-semibold leading-tight text-white ${
                        isRight ? "bg-green-700" : "bg-amber-800"
                      }`}
                    >
                      <Icon name={isRight ? "tick" : "cross"} />
                      {isRight ? "Correct" : "Not this one"}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {dragged &&
        drag &&
        createPortal(
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-50 size-20 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-primary bg-white p-1 opacity-90 shadow-lg"
            style={{ left: drag.x, top: drag.y }}
          >
            <Picture media={media} item={dragged} />
          </div>,
          document.body
        )}
    </div>
  );
}

// What's under the pointer while dragging: a box's id, "pictures" for the picture area, or null.
function dropTargetAt(x: number, y: number): string | null {
  const element = document.elementFromPoint(x, y);
  const box = element?.closest<HTMLElement>("[data-match-box]");
  if (box && !box.closest("[inert]")) return box.dataset.matchBox ?? null;
  return element?.closest("[data-match-pictures]") ? "pictures" : null;
}

function Picture({ media, item }: { media: ResolvedMedia; item: MatchItem | undefined }) {
  const picture = item ? media[item.mediaId] : undefined;
  const src = usePictureSrc(picture?.src);
  if (!picture) return <span className="text-[0.7em] text-slate-700">Picture unavailable</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link; files are pre-shrunk WebP
    <img src={src} alt="" draggable={false} loading="lazy" decoding="async" className="pointer-events-none size-full object-contain" />
  );
}
