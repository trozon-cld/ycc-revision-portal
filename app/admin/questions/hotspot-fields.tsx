"use client";

import { useRef, useState } from "react";
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
import { HotspotCanvas } from "./hotspot-canvas";
import type { Box } from "./hotspot-geometry";
import type { TypeFieldsProps } from "./type-editors";

const SHAPES: [string, string][] = [
  ["rect", "Rectangle"],
  ["ellipse", "Oval"],
];
const clamp = (value: number, max = 100) => Math.min(max, Math.max(0, roundTenth(value)));

// The picture candidates tap, and the correct areas drawn on it (1–5, rectangle or oval).
export function HotspotFields({ content, answer, onChange, newId, media, thumbs, choosePicture }: TypeFieldsProps) {
  const data = content as HotspotContent;
  const solution = answer as HotspotDraftAnswer;
  // The picker answers later; read the latest values then.
  const latest = useRef({ data, solution });
  latest.current = { data, solution };
  const [shape, setShape] = useState<HotspotShape>("rect");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const picture = data.mediaId ? media[data.mediaId] : undefined;
  const thumb = data.mediaId ? (thumbs[data.mediaId] ?? picture?.src) : undefined;
  const full = solution.areas.length >= HOTSPOT_LIMITS.maxAreas;

  const setAreas = (areas: HotspotArea[]) => onChange(latest.current.data, { ...latest.current.solution, areas });
  const updateArea = (id: string, patch: Partial<HotspotArea>) =>
    setAreas(latest.current.solution.areas.map((area) => (area.id === id ? { ...area, ...patch } : area)));

  function addArea(box: Box) {
    if (latest.current.solution.areas.length >= HOTSPOT_LIMITS.maxAreas) return;
    const id = newId();
    setAreas([...latest.current.solution.areas, { id, shape, ...box }]);
    setSelectedId(id);
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
          <legend className="mb-1 text-sm font-medium text-ink">Correct areas (the right answer)</legend>
          <p className="text-sm text-slate-600">
            Every area you draw is a right answer: a tap inside any of them, or within {HOTSPOT_LIMITS.margin}% of one, is
            marked correct. Drag on the picture to draw an area (or click for a small one). Drag an area to move it and
            its square handles to resize it.
          </p>
          <p id="hotspot-keys" className="text-sm text-slate-600">
            With the keyboard: Tab to an area, then use the arrow keys to move it (Shift for bigger steps) and Alt + arrow
            keys to resize it.
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
            <HotspotCanvas
              picture={picture}
              areas={solution.areas}
              shape={shape}
              full={full}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAdd={addArea}
              onUpdate={(id, box) => updateArea(id, box)}
            />
          ) : (
            <p className="rounded-md bg-slate-100 px-3 py-6 text-center text-sm text-slate-600">Loading the picture…</p>
          )}

          <p className="text-sm text-slate-600" aria-live="polite">
            {solution.areas.length === 0
              ? "No correct area yet."
              : `${solution.areas.length} correct ${solution.areas.length === 1 ? "area" : "areas"} (up to ${HOTSPOT_LIMITS.maxAreas}).`}
            {full && " Remove an area to draw another."}
          </p>

          {solution.areas.length > 0 && (
            <ol className="space-y-2">
              {solution.areas.map((area, index) => (
                <AreaRow
                  key={area.id}
                  area={area}
                  number={index + 1}
                  selected={area.id === selectedId}
                  onSelect={() => setSelectedId(area.id)}
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
  selected,
  onSelect,
  onChange,
  onRemove,
}: {
  area: HotspotArea;
  number: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<HotspotArea>) => void;
  onRemove: () => void;
}) {
  const tooSmall = area.w < HOTSPOT_LIMITS.minSize || area.h < HOTSPOT_LIMITS.minSize;
  const outside = roundTenth(area.x + area.w) > 100 || roundTenth(area.y + area.h) > 100;
  return (
    <li
      aria-label={`Area ${number}`}
      onFocusCapture={onSelect}
      onPointerDown={onSelect}
      className={`space-y-2 rounded-md border bg-white p-2 ${selected ? "border-primary ring-1 ring-primary" : "border-slate-200"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">Correct area {number}</p>
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
