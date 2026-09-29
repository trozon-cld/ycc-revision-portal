"use client";

import { useId, useRef, useState } from "react";
import { AREA_CHOICE_LIMITS, overlappingPairs, type AreaChoiceDraft } from "@/lib/questions/types/area-choice";
import type { HotspotArea, HotspotShape } from "@/lib/questions/types/hotspot";
import { Segmented } from "@/components/admin/editor-fields";
import { buttonClass, inputClass, labelClass } from "@/components/admin/styles";
import { HotspotCanvas } from "./hotspot-canvas";
import { AreaRow, SHAPES } from "./hotspot-fields";
import type { Box } from "./hotspot-geometry";
import type { TypeFieldsProps } from "./type-editors";

type Content = AreaChoiceDraft["content"];
type Answer = AreaChoiceDraft["answer"];
type Area = Content["areas"][number];

// "Choose the area": the picture, 2–6 areas that don't overlap, and which one is right.
export function AreaChoiceFields({ content, answer, onChange, newId, media, thumbs, choosePicture }: TypeFieldsProps) {
  const data = content as Content;
  const solution = answer as Answer;
  // The picker answers later; read the latest values then.
  const latest = useRef({ data, solution });
  latest.current = { data, solution };
  const [shape, setShape] = useState<HotspotShape>("rect");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const groupName = useId();

  const picture = data.mediaId ? media[data.mediaId] : undefined;
  const thumb = data.mediaId ? (thumbs[data.mediaId] ?? picture?.src) : undefined;
  const full = data.areas.length >= AREA_CHOICE_LIMITS.maxAreas;

  const setAreas = (areas: Area[]) => {
    const keep = areas.some((area) => area.id === latest.current.solution.correctAreaId) ? latest.current.solution.correctAreaId : "";
    onChange({ ...latest.current.data, areas }, { ...latest.current.solution, correctAreaId: keep });
  };
  const updateArea = (id: string, patch: Partial<Area>) =>
    setAreas(latest.current.data.areas.map((area) => (area.id === id ? { ...area, ...patch } : area)));

  function addArea(box: Box) {
    if (latest.current.data.areas.length >= AREA_CHOICE_LIMITS.maxAreas) return;
    const id = newId();
    setAreas([...latest.current.data.areas, { id, shape, name: "", ...box }]);
    setSelectedId(id);
  }

  const overlaps = overlappingPairs(data.areas);
  const overlapFor = (index: number) => {
    const others = overlaps.flatMap(([a, b]) => (a === index ? [b + 1] : b === index ? [a + 1] : []));
    return others.length ? `Overlaps area ${others.join(" and ")}. Move them apart.` : undefined;
  };
  const rightIndex = data.areas.findIndex((area) => area.id === solution.correctAreaId);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className={labelClass}>Picture</p>
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
              onClick={() => choosePicture((mediaId) => onChange({ ...latest.current.data, mediaId }, latest.current.solution))}
              className={buttonClass("secondary", "sm")}
            >
              {data.mediaId ? "Change picture" : "Choose picture"}
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          Screen readers use the picture&apos;s description from Media, so describe the whole scene there.
        </p>
      </div>

      {data.mediaId && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-ink">Areas to choose from</legend>
          <p className="text-sm text-slate-600">
            Draw {AREA_CHOICE_LIMITS.minAreas} to {AREA_CHOICE_LIMITS.maxAreas} areas that don&apos;t overlap, then mark the one
            that&apos;s right. With a mouse, candidates see an area light up as they move over it; on touch screens every area is
            faintly outlined. Drag an area to move it and its square handles to resize it.
          </p>
          <p id="hotspot-keys" className="text-sm text-slate-600">
            With the keyboard: Tab to an area, then use the arrow keys to move it (Shift for bigger steps) and Alt + arrow keys
            to resize it.
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
              areas={data.areas}
              shape={shape}
              full={full}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAdd={addArea}
              onUpdate={(id, box) => updateArea(id, box)}
              areaName={(index) => `Area ${index + 1}${index === rightIndex ? " (right answer)" : ""}`}
              isCorrect={(area: HotspotArea) => area.id === solution.correctAreaId}
            />
          ) : (
            <p className="rounded-md bg-slate-100 px-3 py-6 text-center text-sm text-slate-600">Loading the picture…</p>
          )}

          <p className="text-sm text-slate-600" aria-live="polite">
            {data.areas.length} of {AREA_CHOICE_LIMITS.maxAreas} areas ·{" "}
            {rightIndex >= 0 ? (
              `Right answer: area ${rightIndex + 1}`
            ) : (
              <span className="font-medium text-amber-900">Mark which area is the right answer.</span>
            )}
            {full && " · Remove an area to draw another."}
          </p>

          {data.areas.length > 0 && (
            <ol className="space-y-2">
              {data.areas.map((area, index) => (
                <AreaRow
                  key={area.id}
                  area={area}
                  number={index + 1}
                  title={`Area ${index + 1}`}
                  selected={area.id === selectedId}
                  onSelect={() => setSelectedId(area.id)}
                  onChange={(patch) => updateArea(area.id, patch)}
                  onRemove={() => setAreas(latest.current.data.areas.filter((item) => item.id !== area.id))}
                  problem={overlapFor(index)}
                >
                  <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <label htmlFor={`area-${area.id}-name`} className="text-xs font-medium text-slate-700">
                        Spoken name (optional)<span className="sr-only">, area {index + 1}</span>
                      </label>
                      <input
                        id={`area-${area.id}-name`}
                        type="text"
                        value={area.name}
                        maxLength={AREA_CHOICE_LIMITS.nameLength}
                        placeholder={`Area ${index + 1}`}
                        onChange={(event) => updateArea(area.id, { name: event.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm text-ink">
                      <input
                        type="radio"
                        name={groupName}
                        checked={area.id === solution.correctAreaId}
                        onChange={() => onChange(latest.current.data, { ...latest.current.solution, correctAreaId: area.id })}
                        className="size-4 accent-green-700"
                      />
                      <span className={area.id === solution.correctAreaId ? "font-semibold text-green-900" : ""}>
                        Right answer<span className="sr-only"> (area {index + 1})</span>
                      </span>
                    </label>
                  </div>
                </AreaRow>
              ))}
            </ol>
          )}
          <p className="text-sm text-slate-600">
            Spoken names are read aloud by screen readers (for example &quot;Ladder&quot;) and are never shown.
          </p>
        </fieldset>
      )}

      <div className="space-y-1">
        <label htmlFor="area-choice-label" className={labelClass}>
          Answer label <span className="font-normal text-slate-600">(optional)</span>
        </label>
        <input
          id="area-choice-label"
          type="text"
          value={solution.label}
          maxLength={AREA_CHOICE_LIMITS.labelLength}
          onChange={(event) => onChange(latest.current.data, { ...latest.current.solution, label: event.target.value })}
          className={inputClass}
        />
        <p className="text-sm text-slate-600">
          For example &quot;Gloves&quot;. Shown on the right area after Check or Reveal in the Handbook only.
        </p>
      </div>
    </div>
  );
}
