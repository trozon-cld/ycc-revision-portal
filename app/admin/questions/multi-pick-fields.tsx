"use client";

import { useEffect, useRef } from "react";
import { MULTI_PICK_LIMITS, type MultiPickContent } from "@/lib/questions/types/multi-pick";
import { optionLetter } from "@/lib/questions/types/single-text";
import { IconButton, Segmented } from "@/components/admin/editor-fields";
import { buttonClass, inputClass } from "@/components/admin/styles";
import type { TypeFieldsProps } from "./type-editors";

type Answer = { correctOptionIds: string[] };

// Answer options for "Multiple answers": 3–6 options, candidates choose 2 or 3, exactly that many correct.
export function MultiPickFields({ content, answer, onChange, newId }: TypeFieldsProps) {
  const data = content as MultiPickContent;
  const correct = (answer as Answer).correctOptionIds;
  const focusId = useRef<string | null>(null);

  useEffect(() => {
    if (!focusId.current) return;
    document.getElementById(`option-${focusId.current}`)?.focus();
    focusId.current = null;
  }, [data.options.length]);

  // Correct answers are kept in option order, so saving the same answer never looks like a change.
  const ordered = (options: MultiPickContent["options"], ids: string[]) =>
    options.map((option) => option.id).filter((id) => ids.includes(id));
  const setOptions = (options: MultiPickContent["options"]) =>
    onChange({ ...data, options }, { correctOptionIds: ordered(options, correct) });

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= data.options.length) return;
    const next = [...data.options];
    [next[index], next[target]] = [next[target], next[index]];
    setOptions(next);
  }

  function add() {
    if (data.options.length >= MULTI_PICK_LIMITS.maxOptions) return;
    const id = newId();
    focusId.current = id;
    setOptions([...data.options, { id, text: "" }]);
  }

  function toggleCorrect(id: string, on: boolean) {
    const ids = on ? [...correct, id] : correct.filter((item) => item !== id);
    onChange(data, { correctOptionIds: ordered(data.options, ids) });
  }

  const canRemove = data.options.length > MULTI_PICK_LIMITS.minOptions;
  const marked = correct.length;

  return (
    <div className="space-y-3">
      <Segmented
        label="Candidates choose"
        value={String(data.pick)}
        options={MULTI_PICK_LIMITS.picks.map((n) => [String(n), `${n} answers`])}
        onChange={(value) => onChange({ ...data, pick: Number(value) }, answer)}
      />

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-ink">Answer options</legend>
        <p className="text-sm text-slate-600">
          Type each option and tick the {data.pick} correct ones. Use **words** for bold.
        </p>
        <ol className="space-y-2">
          {data.options.map((option, index) => {
            const letter = optionLetter(index);
            const isCorrect = correct.includes(option.id);
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
                    maxLength={MULTI_PICK_LIMITS.optionLength}
                    onChange={(event) =>
                      setOptions(data.options.map((item) => (item.id === option.id ? { ...item, text: event.target.value } : item)))
                    }
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
                    type="checkbox"
                    checked={isCorrect}
                    onChange={(event) => toggleCorrect(option.id, event.target.checked)}
                    className="size-4 accent-green-700"
                  />
                  <span className={isCorrect ? "font-semibold text-green-900" : ""}>
                    Correct
                    <span className="sr-only"> (option {letter})</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ol>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} disabled={data.options.length >= MULTI_PICK_LIMITS.maxOptions} className={buttonClass("secondary", "sm")}>
          <span aria-hidden="true">+</span> Add option
        </button>
        <p className="text-sm text-slate-600" aria-live="polite">
          {data.options.length} of {MULTI_PICK_LIMITS.maxOptions} options ·{" "}
          <span className={marked === data.pick ? "" : "font-medium text-amber-900"}>
            {marked} of {data.pick} correct answers marked
          </span>
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
