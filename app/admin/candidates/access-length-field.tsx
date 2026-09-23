"use client";

import { useState } from "react";
import { ACCESS_PRESET_DAYS, DEFAULT_ACCESS_DAYS } from "@/lib/candidates/access";

const fieldClass =
  "w-full rounded-lg border border-ink/25 bg-surface px-4 py-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40";

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
    <div className="space-y-3">
      <div className="space-y-2">
        <label htmlFor={`${idPrefix}-length`} className="block text-base font-medium text-ink">
          {label}
        </label>
        <select
          id={`${idPrefix}-length`}
          name="accessLength"
          value={length}
          onChange={(event) => setLength(event.target.value)}
          className={fieldClass}
        >
          {ACCESS_PRESET_DAYS.map((days) => (
            <option key={days} value={days}>
              {days} days from today
            </option>
          ))}
          <option value="custom">Choose a date</option>
        </select>
      </div>

      {length === "custom" && (
        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-date`} className="block text-base font-medium text-ink">
            Access ends on
          </label>
          <input
            id={`${idPrefix}-date`}
            name="accessDate"
            type="date"
            required
            min={minDate}
            max={maxDate}
            className={fieldClass}
          />
          <p className="text-base text-ink/70">Access lasts until the end of this day (UK time), up to 1 year from today.</p>
        </div>
      )}
    </div>
  );
}
