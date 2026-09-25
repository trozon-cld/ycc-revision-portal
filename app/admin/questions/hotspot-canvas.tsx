"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ResolvedMedia } from "@/lib/content/book";
import type { HotspotArea, HotspotShape } from "@/lib/questions/types/hotspot";
import { drawnBox, HANDLES, moveBox, nudgeBox, resizeBox, type Box, type Handle } from "./hotspot-geometry";

type Session =
  | { mode: "draw"; start: { x: number; y: number } }
  | { mode: "move" | "resize"; id: string; handle?: Handle; start: { x: number; y: number }; box: Box };

const HANDLE_PLACE: Record<Handle, string> = {
  nw: "left-0 top-0 cursor-nwse-resize",
  n: "left-1/2 top-0 cursor-ns-resize",
  ne: "left-full top-0 cursor-nesw-resize",
  e: "left-full top-1/2 cursor-ew-resize",
  se: "left-full top-full cursor-nwse-resize",
  s: "left-1/2 top-full cursor-ns-resize",
  sw: "left-0 top-full cursor-nesw-resize",
  w: "left-0 top-1/2 cursor-ew-resize",
};
const SHAPE_NAME: Record<HotspotShape, string> = { rect: "rectangle", ellipse: "oval" };

// The picture with its correct areas: draw on empty space, drag an area to move it, drag its
// handles to resize it. Each area is also a button: arrow keys move it, Alt + arrow keys resize it.
export function HotspotCanvas({
  picture,
  areas,
  shape,
  full,
  selectedId,
  onSelect,
  onAdd,
  onUpdate,
}: {
  picture: ResolvedMedia[string];
  areas: HotspotArea[];
  shape: HotspotShape;
  full: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (box: Box) => void;
  onUpdate: (id: string, box: Box) => void;
}) {
  const session = useRef<Session | null>(null);
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const ratio = picture.width / picture.height;

  function pointAt(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * 100, y: ((event.clientY - box.top) / box.height) * 100 };
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-handle]")?.dataset.handle as Handle | undefined;
    const areaId = target.closest<HTMLElement>("[data-area-id]")?.dataset.areaId;
    const start = pointAt(event);
    const area = areaId ? areas.find((item) => item.id === areaId) : undefined;
    if (area) {
      session.current = { mode: handle ? "resize" : "move", id: area.id, handle, start, box: area };
      onSelect(area.id);
    } else {
      onSelect(null);
      if (full) return;
      session.current = { mode: "draw", start };
      setDrawing({ x0: start.x, y0: start.y, x1: start.x, y1: start.y });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = session.current;
    if (!current) return;
    const at = pointAt(event);
    if (current.mode === "draw") {
      setDrawing({ x0: current.start.x, y0: current.start.y, x1: at.x, y1: at.y });
      return;
    }
    const dx = at.x - current.start.x;
    const dy = at.y - current.start.y;
    onUpdate(current.id, current.mode === "move" ? moveBox(current.box, dx, dy) : resizeBox(current.box, current.handle!, dx, dy));
  }

  function onPointerUp() {
    if (session.current?.mode === "draw" && drawing) {
      const clamp = (value: number) => Math.min(100, Math.max(0, value));
      onAdd(drawnBox(clamp(drawing.x0), clamp(drawing.y0), clamp(drawing.x1), clamp(drawing.y1)));
    }
    session.current = null;
    setDrawing(null);
  }

  function onAreaKey(event: KeyboardEvent<HTMLButtonElement>, area: HotspotArea) {
    const next = nudgeBox(area, event.key, event.shiftKey, event.altKey);
    if (!next) return;
    event.preventDefault();
    onUpdate(area.id, next);
  }

  return (
    <div className="mx-auto" style={{ width: `min(100%, calc(60vh * ${ratio.toFixed(4)}))` }}>
      <div
        role="group"
        aria-label="Picture with the correct areas"
        data-hotspot-canvas
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          session.current = null;
          setDrawing(null);
        }}
        className={`relative w-full touch-none select-none rounded-md bg-slate-100 ring-1 ring-slate-300 ${full ? "" : "cursor-crosshair"}`}
        style={{ aspectRatio: String(ratio) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link */}
        <img src={picture.src} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full rounded-md" />
        {areas.map((area, index) => {
          const selected = area.id === selectedId;
          return (
            <button
              key={area.id}
              type="button"
              data-area-id={area.id}
              aria-label={`Correct area ${index + 1}: ${SHAPE_NAME[area.shape]}, ${area.x}% from the left, ${area.y}% from the top, ${area.w}% wide, ${area.h}% tall`}
              aria-describedby="hotspot-keys"
              onFocus={() => onSelect(area.id)}
              onKeyDown={(event) => onAreaKey(event, area)}
              className={`absolute cursor-move border-2 shadow-[0_0_0_1px_white] outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                area.shape === "ellipse" ? "rounded-[50%]" : ""
              } ${selected ? "z-10 border-primary bg-primary/20" : "border-green-700 bg-green-600/20"}`}
              style={{ left: `${area.x}%`, top: `${area.y}%`, width: `${area.w}%`, height: `${area.h}%` }}
            >
              <span
                className={`pointer-events-none absolute left-1/2 top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-xs font-bold text-white ${
                  selected ? "bg-primary" : "bg-green-700"
                }`}
              >
                {index + 1}
              </span>
              {selected &&
                HANDLES.map((handle) => (
                  <span
                    key={handle}
                    data-handle={handle}
                    aria-hidden="true"
                    className={`absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-primary bg-white before:absolute before:-inset-2.5 before:content-[''] ${HANDLE_PLACE[handle]}`}
                  />
                ))}
            </button>
          );
        })}
        {drawing && (
          <span
            className={`pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10 ${shape === "ellipse" ? "rounded-[50%]" : ""}`}
            style={{
              left: `${Math.min(drawing.x0, drawing.x1)}%`,
              top: `${Math.min(drawing.y0, drawing.y1)}%`,
              width: `${Math.abs(drawing.x1 - drawing.x0)}%`,
              height: `${Math.abs(drawing.y1 - drawing.y0)}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}
