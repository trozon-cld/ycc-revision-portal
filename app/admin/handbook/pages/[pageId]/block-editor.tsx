"use client";

import { useRef, type ReactNode } from "react";
import type { Block } from "@/lib/content/blocks";
import { BLOCK_LIMITS } from "@/lib/content/blocks";
import { BLOCK_LABELS, applyBold } from "@/lib/content/editor";
import { buttonClass, cardClass, inputClass, labelClass, textareaClass } from "@/components/admin/styles";

export function BlockEditor({
  block,
  index,
  total,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
  onChoosePicture,
  picture,
}: {
  block: Block;
  index: number;
  total: number;
  onChange: (block: Block) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onChoosePicture: () => void;
  picture?: { thumbUrl?: string; alt?: string };
}) {
  const position = index + 1;
  const label = BLOCK_LABELS[block.type];

  return (
    <li id={`block-${block.id}`} className={`${cardClass} p-3`} aria-label={`Block ${position}: ${label}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {position} · {label}
        </p>
        <div className="flex items-center gap-0.5">
          <IconButton label={`Move block ${position} up`} disabled={index === 0} onClick={() => onMove(-1)} path="M10 15V5M5.5 9.5 10 5l4.5 4.5" />
          <IconButton label={`Move block ${position} down`} disabled={index === total - 1} onClick={() => onMove(1)} path="M10 5v10M5.5 10.5 10 15l4.5-4.5" />
          <IconButton label={`Duplicate block ${position}`} onClick={onDuplicate} path="M7 7h8v8H7zM5 13V5h8" />
          <IconButton label={`Delete block ${position}`} onClick={onRemove} path="M5 6h10M8 6V4.5h4V6M6.5 6l.7 9.5h5.6l.7-9.5" danger />
        </div>
      </div>
      <BlockFields block={block} onChange={onChange} onChoosePicture={onChoosePicture} picture={picture} />
    </li>
  );
}

function BlockFields({
  block,
  onChange,
  onChoosePicture,
  picture,
}: {
  block: Block;
  onChange: (block: Block) => void;
  onChoosePicture: () => void;
  picture?: { thumbUrl?: string; alt?: string };
}) {
  const id = block.id;
  switch (block.type) {
    case "heading":
      return (
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <Select
            id={`${id}-level`}
            label="Size"
            value={String(block.level)}
            onChange={(value) => onChange({ ...block, level: value === "1" ? 1 : 2 })}
            options={[
              ["1", "Main heading"],
              ["2", "Subheading"],
            ]}
          />
          <div className="space-y-1">
            <label htmlFor={`${id}-text`} className={labelClass}>
              Heading text
            </label>
            <input
              id={`${id}-text`}
              type="text"
              value={block.text}
              maxLength={BLOCK_LIMITS.headingLength}
              onChange={(event) => onChange({ ...block, text: event.target.value })}
              className={inputClass}
            />
          </div>
        </div>
      );
    case "paragraph":
      return (
        <BoldTextarea
          id={`${id}-text`}
          label="Text"
          value={block.text}
          maxLength={BLOCK_LIMITS.textLength}
          rows={4}
          onChange={(text) => onChange({ ...block, text })}
        />
      );
    case "list":
      return (
        <div className="space-y-2">
          <Select
            id={`${id}-style`}
            label="Style"
            value={block.style}
            onChange={(value) => onChange({ ...block, style: value === "numbered" ? "numbered" : "bullet" })}
            options={[
              ["bullet", "Bullet points"],
              ["numbered", "Numbered steps"],
            ]}
          />
          <BoldTextarea
            id={`${id}-text`}
            label="Items"
            hint="One item per line."
            value={block.items.join("\n")}
            maxLength={BLOCK_LIMITS.listItems * (BLOCK_LIMITS.listItemLength + 1)}
            rows={4}
            onChange={(text) => onChange({ ...block, items: text.split("\n") })}
          />
        </div>
      );
    case "picture":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            {block.mediaId && picture?.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed thumbnail
              <img src={picture.thumbUrl} alt="" className="size-24 shrink-0 rounded-md bg-slate-100 object-contain" />
            ) : (
              <div className="grid size-24 shrink-0 place-items-center rounded-md bg-slate-100 text-center text-xs text-slate-600">
                {block.mediaId ? "Picture chosen" : "No picture yet"}
              </div>
            )}
            <div className="min-w-0 space-y-1.5">
              {block.mediaId && picture?.alt && (
                <p className="line-clamp-2 text-sm text-slate-700 [overflow-wrap:anywhere]">{picture.alt}</p>
              )}
              <button
                id={`${id}-text`}
                type="button"
                onClick={onChoosePicture}
                className={buttonClass(block.mediaId ? "secondary" : "primary", "sm")}
              >
                {block.mediaId ? "Change picture" : "Choose picture"}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-caption`} className={labelClass}>
              Caption <span className="font-normal text-slate-600">(optional)</span>
            </label>
            <input
              id={`${id}-caption`}
              type="text"
              value={block.caption ?? ""}
              maxLength={BLOCK_LIMITS.captionLength}
              onChange={(event) => onChange({ ...block, caption: event.target.value })}
              className={inputClass}
            />
          </div>
        </div>
      );
    case "callout":
      return (
        <div className="space-y-2">
          <Select
            id={`${id}-tone`}
            label="Box style"
            value={block.tone}
            onChange={(value) => onChange({ ...block, tone: value === "remember" ? "remember" : "key-point" })}
            options={[
              ["key-point", "Key point (blue)"],
              ["remember", "Remember (amber)"],
            ]}
          />
          <BoldTextarea
            id={`${id}-text`}
            label="Text"
            value={block.text}
            maxLength={BLOCK_LIMITS.textLength}
            rows={3}
            onChange={(text) => onChange({ ...block, text })}
          />
        </div>
      );
  }
}

// A textarea with a Bold button (and Ctrl/Cmd+B) that wraps the selection in ** markers.
function BoldTextarea({
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

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

function IconButton({
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
