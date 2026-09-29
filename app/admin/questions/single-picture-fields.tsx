"use client";

import { useId, useRef } from "react";
import { SINGLE_PICTURE_LIMITS, type PictureOptionDraft } from "@/lib/questions/types/single-picture";
import { optionLetter } from "@/lib/questions/types/single-text";
import { IconButton } from "@/components/admin/editor-fields";
import { buttonClass, inputClass } from "@/components/admin/styles";
import type { TypeFieldsProps } from "./type-editors";

type Content = { options: PictureOptionDraft[]; keepOrder: boolean };
type Answer = { correctOptionId: string };

// Answer options for "Single answer, picture options": 2–4 pictures, each with an optional label.
export function SinglePictureFields({ content, answer, onChange, newId, media, thumbs, choosePicture }: TypeFieldsProps) {
  const data = content as Content;
  const correct = (answer as Answer).correctOptionId;
  const groupName = useId();
  // The picker answers later; read the latest options then, not the ones from when it opened.
  const latest = useRef({ data, correct });
  latest.current = { data, correct };

  const setOptions = (options: PictureOptionDraft[]) => {
    const keep = options.some((option) => option.id === latest.current.correct) ? latest.current.correct : "";
    onChange({ ...latest.current.data, options }, { correctOptionId: keep });
  };
  const updateOption = (id: string, patch: Partial<PictureOptionDraft>) =>
    setOptions(latest.current.data.options.map((option) => (option.id === id ? { ...option, ...patch } : option)));
  const pickFor = (id: string) => choosePicture((mediaId) => updateOption(id, { mediaId }));

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= data.options.length) return;
    const next = [...data.options];
    [next[index], next[target]] = [next[target], next[index]];
    setOptions(next);
  }

  function add() {
    if (data.options.length >= SINGLE_PICTURE_LIMITS.maxOptions) return;
    const id = newId();
    setOptions([...data.options, { id, mediaId: "", label: "" }]);
    pickFor(id);
  }

  const canRemove = data.options.length > SINGLE_PICTURE_LIMITS.minOptions;
  const missing = data.options.filter((option) => !option.mediaId).length;

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-ink">Answer options</legend>
        <p className="text-sm text-slate-600">
          Choose a picture for each option and mark the correct one. Labels are optional. Screen readers use each
          picture&apos;s description from Media.
        </p>
        <ol className="grid gap-2 sm:grid-cols-2">
          {data.options.map((option, index) => {
            const letter = optionLetter(index);
            const isCorrect = option.id === correct;
            const thumb = option.mediaId ? (thumbs[option.mediaId] ?? media[option.mediaId]?.src) : undefined;
            const alt = option.mediaId ? media[option.mediaId]?.alt : undefined;
            return (
              <li
                key={option.id}
                aria-label={`Option ${letter}`}
                className={`space-y-2 rounded-md border p-2 ${isCorrect ? "border-green-700 bg-green-50/60" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700">Option {letter}</p>
                  <div className="flex shrink-0 items-center">
                    <IconButton label={`Move option ${letter} up`} disabled={index === 0} onClick={() => move(index, -1)} path="M10 15V5M5.5 9.5 10 5l4.5 4.5" />
                    <IconButton
                      label={`Move option ${letter} down`}
                      disabled={index === data.options.length - 1}
                      onClick={() => move(index, 1)}
                      path="M10 5v10M5.5 10.5 10 15l4.5-4.5"
                    />
                    <IconButton
                      label={`Remove option ${letter}`}
                      disabled={!canRemove}
                      onClick={() => setOptions(data.options.filter((item) => item.id !== option.id))}
                      path="M5 6h10M8 6V4.5h4V6M6.5 6l.7 9.5h5.6l.7-9.5"
                      danger
                    />
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed thumbnail
                    <img src={thumb} alt="" className="size-20 shrink-0 rounded-md bg-slate-100 object-contain" />
                  ) : (
                    <span className="grid size-20 shrink-0 place-items-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-1 text-center text-xs text-slate-600">
                      {option.mediaId ? "Picture chosen" : "No picture yet"}
                    </span>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    {alt && <p className="line-clamp-2 text-xs text-slate-700 [overflow-wrap:anywhere]">{alt}</p>}
                    <button type="button" onClick={() => pickFor(option.id)} className={buttonClass("secondary", "sm")}>
                      {option.mediaId ? "Change picture" : "Choose picture"}
                      <span className="sr-only"> for option {letter}</span>
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor={`label-${option.id}`} className="sr-only">
                    Label for option {letter} (optional)
                  </label>
                  <input
                    id={`label-${option.id}`}
                    type="text"
                    value={option.label}
                    maxLength={SINGLE_PICTURE_LIMITS.labelLength}
                    placeholder="Label (optional)"
                    onChange={(event) => updateOption(option.id, { label: event.target.value })}
                    className={inputClass}
                  />
                </div>
                <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name={groupName}
                    checked={isCorrect}
                    onChange={() => onChange(data, { correctOptionId: option.id })}
                    className="size-4 accent-green-700"
                  />
                  <span className={isCorrect ? "font-semibold text-green-900" : ""}>
                    {isCorrect ? "Correct answer" : "Mark as correct"}
                    <span className="sr-only"> (option {letter})</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ol>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} disabled={data.options.length >= SINGLE_PICTURE_LIMITS.maxOptions} className={buttonClass("secondary", "sm")}>
          <span aria-hidden="true">+</span> Add option
        </button>
        <p className="text-sm text-slate-600">
          {data.options.length} of {SINGLE_PICTURE_LIMITS.maxOptions} options
          {missing > 0 && ` · ${missing} still need${missing === 1 ? "s" : ""} a picture`}
          {!correct && missing === 0 && " · no correct answer chosen yet"}
        </p>
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={data.keepOrder}
          onChange={(event) => onChange({ ...data, keepOrder: event.target.checked }, answer)}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          <span className="font-medium">Keep options in this order</span>
          <span className="block text-slate-600">Otherwise Practice and Mock tests shuffle the options.</span>
        </span>
      </label>
    </div>
  );
}
