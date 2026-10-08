"use client";

import { useState } from "react";
import { ACCESS_PRESET_DAYS, DEFAULT_ACCESS_DAYS, addDays, dateOnly, formatUkDate } from "@/lib/candidates/access";
import { Field } from "@/components/admin/field";
import { inputClass } from "@/components/admin/styles";

// min/max come from the server so the client clock can't disagree with validation.
// `base`: when changing access, presets add to this day (the current end date); new candidates start from today.
export function AccessLengthField({
  idPrefix,
  label,
  minDate,
  maxDate,
  base,
}: {
  idPrefix: string;
  label: string;
  minDate: string;
  maxDate: string;
  base?: string;
}) {
  const extending = base !== undefined && base >= minDate;
  const presets = ACCESS_PRESET_DAYS.map((days) => {
    const end = addDays(base ?? addDays(minDate, -1), days);
    return { days, end, allowed: end <= maxDate };
  });
  const firstAllowed = presets.find((preset) => preset.allowed && preset.days === DEFAULT_ACCESS_DAYS) ?? presets.find((preset) => preset.allowed);
  const [length, setLength] = useState(firstAllowed ? String(firstAllowed.days) : "custom");

  return (
    <>
      <Field id={`${idPrefix}-length`} label={label}>
        <select
          id={`${idPrefix}-length`}
          name="accessLength"
          value={length}
          onChange={(event) => setLength(event.target.value)}
          className={inputClass}
        >
          {presets.map(({ days, end, allowed }) => (
            <option key={days} value={days} disabled={!allowed}>
              {base === undefined
                ? `${days} days from today`
                : `${extending ? `Add ${days} days` : `${days} days from today`} (until ${formatUkDate(dateOnly(end))})${allowed ? "" : ": more than 1 year away"}`}
            </option>
          ))}
          <option value="custom">Choose a date</option>
        </select>
      </Field>

      {length === "custom" && (
        <Field
          id={`${idPrefix}-date`}
          label="Access ends on"
          hint="Access lasts until the end of this day (UK time), up to 1 year from today."
        >
          <input
            id={`${idPrefix}-date`}
            name="accessDate"
            type="date"
            required
            min={minDate}
            max={maxDate}
            className={inputClass}
          />
        </Field>
      )}
    </>
  );
}
