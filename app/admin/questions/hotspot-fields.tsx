"use client";

import { useRef, useState, type PointerEvent } from "react";
import {
  HOTSPOT_LIMITS,
  roundTenth,
  type HotspotArea,
  type HotspotContent,
  type HotspotDraftAnswer,
  type HotspotShape,
} from "@/lib/questions/types/hotspot";
import { IconButton, Segmented } from "@/components/admin/editor-fields";
import { buttonClass, inputClass, labelClass } from "@/components/admin/styles";
import type { TypeFieldsProps } from "./type-editors";

const SHAPES: [string, string][] = [
  ["rect", "Rectangle"],
  ["ellipse", "Oval"],
];
// A click without a drag draws an area this size around the point.
const CLICK_SIZE = 12;
const clamp = (value: number, max = 100) => Math.min(max, Math.max(0, roundTenth(value)));

type Drag = { x0: number; y0: number; x1: number; y1: number };

// The picture candidates tap, and the correct areas drawn on it (1–5, rectangle or oval).
export function HotspotFields({ content, answer, onChange, newId, media, thumbs, choosePicture }: TypeFieldsProps) {
  const data = content as HotspotContent;
  const solution = answer as HotspotDraftAnswer;
  // The picker answers later; read the latest values then.
  const latest = useRef({ data, solution });
  latest.current = { data, solution };
  const [shape, setShape] = useState<HotspotShape>("rect");
  const [drag, setDrag] = useState<Drag | null>(null);

  const picture = data.mediaId ? media[data.mediaId] : undefined;
  const thumb = data.mediaId ? (thumbs[data.mediaId] ?? picture?.src) : undefined;
  const full = solution.areas.length >= HOTSPOT_LIMITS.maxAreas;

  const setAreas = (areas: HotspotArea[]) => onChange(latest.current.data, { ...latest.current.solution, areas });
  const updateArea = (id: string, patch: Partial<HotspotArea>) =>
    setAreas(latest.current.solution.areas.map((area) => (area.id === id ? { ...area, ...patch } : area)));

  function addArea(box: Omit<HotspotArea, "id" | "shape">) {
    if (latest.current.solution.areas.length >= HOTSPOT_LIMITS.maxAreas) return;
    setAreas([...latest.current.solution.areas, { id: newId(), shape, ...box }]);
  }

  function pointAt(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: clamp(((event.clientX - box.left) / box.width) * 100), y: clamp(((event.clientY - box.top) / box.height) * 100) };
  }

  function finishDrag(end: Drag) {
    const w = Math.abs(end.x1 - end.x0);
    const h = Math.abs(end.y1 - end.y0);
    if (w < 2 && h < 2) {
      addArea({
        x: clamp(end.x0 - CLICK_SIZE / 2, 100 - CLICK_SIZE),
        y: clamp(end.y0 - CLICK_SIZE / 2, 100 - CLICK_SIZE),
        w: CLICK_SIZE,
        h: CLICK_SIZE,
      });
    } else {
      addArea({ x: Math.min(end.x0, end.x1), y: Math.min(end.y0, end.y1), w: roundTenth(w), h: roundTenth(h) });
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className={labelClass}>Picture to tap</p>
        <div className="flex flex-wrap items-center gap-3">
          {data.mediaId &&
            (thumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed thumbnail
              <img src={thumb} alt="" className="size-16 shrink-0 rounded-md bg-slate-100 object-contain" />
            ) : (
              <span className="grid size-16 shrink-0 place-items-center rounded-md bg-slate-100 text-xs text-slate-600">Chosen</span>
            ))}
          <div className="min-w-0 flex-1 space-y-2">
            {picture?.alt && <p className="line-clamp-2 text-sm text-slate-700 [overflow-wrap:anywhere]">{picture.alt}</p>}
            <button
              type="button"
              onClick={() => choosePicture((mediaId) => onChange({ mediaId }, latest.current.solution))}
              className={buttonClass("secondary", "sm")}
            >
              {data.mediaId ? "Change picture" : "Choose picture"}
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          Candidates tap this picture. Screen readers use its description from Media, so describe the whole scene there.
        </p>
      </div>

      {data.mediaId && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-ink">Correct areas</legend>
          <p className="text-sm text-slate-600">
            Drag on the picture to draw an area, or click for a small one. Tapping any correct area counts as correct, and taps
            within {HOTSPOT_LIMITS.margin}% of an area still count.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Segmented label="Shape to draw" value={shape} options={SHAPES} onChange={(value) => setShape(value as HotspotShape)} />
            <button
              type="button"
              disabled={full}
              onClick={() => addArea({ x: 40, y: 40, w: 20, h: 20 })}
              className={buttonClass("secondary", "sm")}
            >
              <span aria-hidden="true">+</span> Add area
            </button>
          </div>

          {picture ? (
            <div className="mx-auto" style={{ width: `min(100%, calc(60vh * ${(picture.width / picture.height).toFixed(4)}))` }}>
              <div
                data-hotspot-canvas
                aria-hidden="true"
                onPointerDown={(event) => {
                  if (full || event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const start = pointAt(event);
                  setDrag({ x0: start.x, y0: start.y, x1: start.x, y1: start.y });
                }}
                onPointerMove={(event) => {
                  if (!drag) return;
                  const at = pointAt(event);
                  setDrag({ ...drag, x1: at.x, y1: at.y });
                }}
                onPointerUp={() => {
                  if (drag) finishDrag(drag);
                  setDrag(null);
                }}
                onPointerCancel={() => setDrag(null)}
                className={`relative w-full touch-none select-none overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-300 ${
                  full ? "cursor-not-allowed" : "cursor-crosshair"
                }`}
                style={{ aspectRatio: String(picture.width / picture.height) }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link */}
                <img src={picture.src} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full" />
                {solution.areas.map((area, index) => (
                  <span
                    key={area.id}
                    className={`pointer-events-none absolute border-2 border-green-700 bg-green-600/20 shadow-[0_0_0_1px_white] ${
                      area.shape === "ellipse" ? "rounded-[50%]" : ""
                    }`}
                    style={{ left: `${area.x}%`, top: `${area.y}%`, width: `${area.w}%`, height: `${area.h}%` }}
                  >
                    <span className="absolute left-1/2 top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-green-700 text-xs font-bold text-white">
                      {index + 1}
                    </span>
                  </span>
                ))}
                {drag && (
                  <span
                    className={`pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10 ${shape === "ellipse" ? "rounded-[50%]" : ""}`}
                    style={{
                      left: `${Math.min(drag.x0, drag.x1)}%`,
                      top: `${Math.min(drag.y0, drag.y1)}%`,
                      width: `${Math.abs(drag.x1 - drag.x0)}%`,
                      height: `${Math.abs(drag.y1 - drag.y0)}%`,
                    }}
                  />
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-md bg-slate-100 px-3 py-6 text-center text-sm text-slate-600">Loading the picture…</p>
          )}

          <p className="text-sm text-slate-600" aria-live="polite">
            {solution.areas.length} of {HOTSPOT_LIMITS.maxAreas} areas
            {full && " · Remove an area to draw another."}
          </p>

          {solution.areas.length > 0 && (
            <ol className="space-y-2">
              {solution.areas.map((area, index) => (
                <AreaRow
                  key={area.id}
                  area={area}
                  number={index + 1}
                  onChange={(patch) => updateArea(area.id, patch)}
                  onRemove={() => setAreas(latest.current.solution.areas.filter((item) => item.id !== area.id))}
                />
              ))}
            </ol>
          )}
        </fieldset>
      )}

      <div className="space-y-1">
        <label htmlFor="hotspot-label" className={labelClass}>
          Answer label <span className="font-normal text-slate-600">(optional)</span>
        </label>
        <input
          id="hotspot-label"
          type="text"
          value={solution.label}
          maxLength={HOTSPOT_LIMITS.labelLength}
          onChange={(event) => onChange(data, { ...solution, label: event.target.value })}
          className={inputClass}
        />
        <p className="text-sm text-slate-600">
          For example &quot;Gloves&quot;. Shown on the correct area after Check or Reveal in the Handbook only.
        </p>
      </div>
    </div>
  );
}

const FIELDS = [
  ["x", "Left"],
  ["y", "Top"],
  ["w", "Width"],
  ["h", "Height"],
] as const;

function AreaRow({
  area,
  number,
  onChange,
  onRemove,
}: {
  area: HotspotArea;
  number: number;
  onChange: (patch: Partial<HotspotArea>) => void;
  onRemove: () => void;
}) {
  const tooSmall = area.w < HOTSPOT_LIMITS.minSize || area.h < HOTSPOT_LIMITS.minSize;
  const outside = roundTenth(area.x + area.w) > 100 || roundTenth(area.y + area.h) > 100;
  return (
    <li aria-label={`Area ${number}`} className="space-y-2 rounded-md border border-slate-200 bg-white p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">Area {number}</p>
        <div className="flex items-center gap-2">
          <Segmented label="Shape" value={area.shape} options={SHAPES} onChange={(value) => onChange({ shape: value as HotspotShape })} />
          <IconButton label={`Remove area ${number}`} onClick={onRemove} path="M5 6h10M8 6V4.5h4V6M6.5 6l.7 9.5h5.6l.7-9.5" danger />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FIELDS.map(([key, name]) => {
          const id = `area-${area.id}-${key}`;
          return (
            <div key={key} className="space-y-0.5">
              <label htmlFor={id} className="text-xs font-medium text-slate-700">
                {name} (%)<span className="sr-only">, area {number}</span>
              </label>
              <input
                id={id}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.1}
                value={area[key]}
                onChange={(event) => {
                  if (event.target.value === "") return;
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) onChange({ [key]: clamp(value) });
                }}
                className={inputClass}
              />
            </div>
          );
        })}
      </div>
      {(tooSmall || outside) && (
        <p className="text-sm font-medium text-amber-900">
          {tooSmall
            ? `Too small for a finger. Make it at least ${HOTSPOT_LIMITS.minSize}% wide and ${HOTSPOT_LIMITS.minSize}% tall.`
            : "Goes outside the picture. Move it or make it smaller."}
        </p>
      )}
    </li>
  );
}
