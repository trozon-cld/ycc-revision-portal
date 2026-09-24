"use client";

import { useState } from "react";
import { ACCESS_PRESET_DAYS, DEFAULT_ACCESS_DAYS } from "@/lib/candidates/access";
import { Field } from "@/components/admin/field";
import { inputClass } from "@/components/admin/styles";

// min/max come from the server so the client clock can't disagree with validation.
export function AccessLengthField({
  idPrefix,
  label,
  minDate,
  maxDate,
}: {
  idPrefix: string;
  label: string;
  minDate: string;
  maxDate: string;
}) {
  const [length, setLength] = useState(String(DEFAULT_ACCESS_DAYS));

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
          {ACCESS_PRESET_DAYS.map((days) => (
            <option key={days} value={days}>
              {days} days from today
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
