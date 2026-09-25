"use client";

import { useRef, type ReactNode } from "react";
import { applyBold } from "@/lib/content/editor";
import { buttonClass, labelClass, textareaClass } from "./styles";

// Editor controls shared by the page editor and the question editor.

// A textarea with a Bold button (and Ctrl/Cmd+B) that wraps the selection in ** markers.
export function BoldTextarea({
  id,
  label,
  hint,
  value,
  maxLength,
  rows,
  onChange,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  value: string;
  maxLength: number;
  rows: number;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function bold() {
    const area = ref.current;
    if (!area) return;
    const result = applyBold(area.value, area.selectionStart, area.selectionEnd);
    onChange(result.text);
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(result.start, result.end);
    });
  }

  return (
    <div className="space-y-1">
      <div className="flex items-end justify-between gap-2">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        <button
          type="button"
          onClick={bold}
          aria-label="Bold: make the selected words bold"
          title="Bold (Ctrl+B)"
          className={`${buttonClass("secondary", "sm")} min-w-9 font-bold`}
        >
          B
        </button>
      </div>
      <textarea
        ref={ref}
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
            event.preventDefault();
            bold();
          }
        }}
        className={textareaClass}
      />
      <p className="text-xs text-slate-600">
        {hint ? <>{hint} </> : null}Select words and press B to make them bold (shown as **words** here).
      </p>
    </div>
  );
}

export function IconButton({
  label,
  path,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  path: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`${buttonClass("ghost", "icon")} ${danger ? "text-red-700 hover:bg-red-50" : ""}`}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </button>
  );
}
