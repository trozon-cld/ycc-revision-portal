"use client";

import { useEffect, useId, useRef } from "react";
import { cleanLine } from "@/lib/text";
import { optionLetter, SINGLE_TEXT_LIMITS, type SingleTextContent } from "@/lib/questions/types/single-text";
import { IconButton } from "@/components/admin/editor-fields";
import { buttonClass, inputClass } from "@/components/admin/styles";
import type { TypeFieldsProps } from "./type-editors";

type Answer = { correctOptionId: string };

// Answer options for "Single answer, text options": 2–6 options, exactly one marked correct.
export function SingleTextFields({ content, answer, onChange, newId }: TypeFieldsProps) {
  const data = content as SingleTextContent;
  const correct = (answer as Answer).correctOptionId;
  const groupName = useId();
  const focusId = useRef<string | null>(null);

  useEffect(() => {
    if (!focusId.current) return;
    document.getElementById(`option-${focusId.current}`)?.focus();
    focusId.current = null;
  }, [data.options.length]);

  const setOptions = (options: SingleTextContent["options"], nextCorrect = correct) =>
    onChange({ ...data, options }, { correctOptionId: options.some((option) => option.id === nextCorrect) ? nextCorrect : "" });

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= data.options.length) return;
    const next = [...data.options];
    [next[index], next[target]] = [next[target], next[index]];
    setOptions(next);
  }

  function add() {
    if (data.options.length >= SINGLE_TEXT_LIMITS.maxOptions) return;
    const id = newId();
    focusId.current = id;
    setOptions([...data.options, { id, text: "" }]);
  }

  const canRemove = data.options.length > SINGLE_TEXT_LIMITS.minOptions;

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-ink">Answer options</legend>
        <p className="text-sm text-slate-600">Type each option and choose the correct one. Use **words** for bold.</p>
        <ol className="space-y-2">
          {data.options.map((option, index) => {
            const letter = optionLetter(index);
            const isCorrect = option.id === correct;
            return (
              <li
                key={option.id}
                className={`rounded-md border p-2 ${isCorrect ? "border-green-700 bg-green-50/60" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-center gap-2">
                  <label htmlFor={`option-${option.id}`} className="w-6 shrink-0 text-center text-sm font-semibold text-slate-700">
                    <span className="sr-only">Option </span>
                    {letter}
                  </label>
                  <input
                    id={`option-${option.id}`}
                    type="text"
                    value={option.text}
                    maxLength={SINGLE_TEXT_LIMITS.optionLength}
                    onChange={(event) => setOptions(data.options.map((item) => (item.id === option.id ? { ...item, text: event.target.value } : item)))}
                    className={`${inputClass} min-w-0 flex-1`}
                  />
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
                <label className="mt-1.5 ml-8 inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm text-ink">
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
        <button type="button" onClick={add} disabled={data.options.length >= SINGLE_TEXT_LIMITS.maxOptions} className={buttonClass("secondary", "sm")}>
          <span aria-hidden="true">+</span> Add option
        </button>
        <p className="text-sm text-slate-600">
          {data.options.length} of {SINGLE_TEXT_LIMITS.maxOptions} options
          {!correct && data.options.some((option) => cleanLine(option.text)) && " · no correct answer chosen yet"}
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
          <span className="block text-slate-600">
            For options like &quot;All of the above&quot;. Otherwise Practice and Mock tests shuffle the options.
          </span>
        </span>
      </label>
    </div>
  );
}
