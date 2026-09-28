"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { TEXT_SIZES, type BookPageData, type Sheet, type TextSize } from "@/lib/content/book";

// The reader bar and its two panels. Candidate style: big targets, words next to icons,
// high contrast. Panels cover the pages (no pop-up windows) and close with Escape.

const barButton =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border-2 border-ink/25 bg-white font-semibold text-ink hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45 aria-pressed:border-primary aria-pressed:bg-primary/[0.08]";

export function ReaderBar({
  compact,
  tiny,
  ready,
  panel,
  onPanel,
  textSize,
  onTextSizeChange,
}: {
  compact: boolean;
  tiny: boolean;
  ready: boolean;
  panel: "contents" | "goto" | null;
  onPanel: (panel: "contents" | "goto" | null) => void;
  textSize: TextSize;
  onTextSizeChange?: (size: TextSize) => void;
}) {
  const index = TEXT_SIZES.indexOf(textSize);
  const contentsRef = useRef<HTMLButtonElement>(null);
  const gotoRef = useRef<HTMLButtonElement>(null);
  const previous = useRef(panel);
  // When a panel closes, focus goes back to the button that opened it.
  useEffect(() => {
    if (previous.current && !panel) (previous.current === "contents" ? contentsRef : gotoRef).current?.focus();
    previous.current = panel;
  }, [panel]);
  const size = compact ? "h-12 min-w-12 px-3 text-base" : "h-14 min-w-14 px-4 text-lg";
  const toggle = (key: "contents" | "goto") => onPanel(panel === key ? null : key);
  return (
    <div
      role="toolbar"
      aria-label="Reader tools"
      className={`flex items-center gap-2 border-b border-slate-300 bg-white py-2 ${compact ? "px-3" : "px-6"}`}
    >
      <button ref={contentsRef} type="button" aria-pressed={panel === "contents"} disabled={!ready} onClick={() => toggle("contents")} className={`${barButton} ${size}`}>
        <Icon path="M4 6h16M4 12h16M4 18h10" />
        <span className={tiny ? "sr-only" : ""}>Contents</span>
      </button>
      <button ref={gotoRef} type="button" aria-pressed={panel === "goto"} disabled={!ready} onClick={() => toggle("goto")} className={`${barButton} ${size}`}>
        <Icon path="M6 3h9l4 4v14H6zM14 3v5h5" />
        <span className={tiny ? "sr-only" : ""}>{compact ? "Page" : "Go to page"}</span>
        {tiny && <span className="sr-only">Go to page</span>}
      </button>
      <span className="flex-1" />
      {onTextSizeChange && (
        <>
          <button
            type="button"
            aria-label="Smaller text"
            disabled={index <= 0}
            onClick={() => onTextSizeChange(TEXT_SIZES[Math.max(0, index - 1)])}
            className={`${barButton} ${size}`}
          >
            <span aria-hidden="true">A−</span>
          </button>
          <button
            type="button"
            aria-label="Larger text"
            disabled={index >= TEXT_SIZES.length - 1}
            onClick={() => onTextSizeChange(TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, index + 1)])}
            className={`${barButton} ${size}`}
          >
            <span aria-hidden="true" className="text-[1.15em]">
              A+
            </span>
          </button>
          <span className="sr-only" aria-live="polite">
            Text size {textSize}
          </span>
        </>
      )}
      {/* Reserved for reading aloud (phase 2). */}
      <button type="button" disabled title="Listen is coming later" className={`${barButton} ${size}`}>
        <Icon path="M5 10v4h3l4 4V6L8 10zM15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
        <span className={compact ? "sr-only" : ""}>Listen</span>
        <span className="sr-only"> (coming later)</span>
      </button>
    </div>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

// Covers the pages; focus moves in on open and Escape closes it.
function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const headingId = useId();
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current?.querySelector<HTMLElement>("button");
    first?.focus();
  }, []);
  return (
    <div
      ref={ref}
      role="region"
      aria-labelledby={headingId}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className="absolute inset-0 z-20 flex flex-col bg-white"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h2 id={headingId} className="text-xl font-bold text-ink">
          {title}
        </h2>
        <button type="button" onClick={onClose} className={`${barButton} h-12 px-4 text-base`}>
          <Icon path="M6 6l12 12M18 6L6 18" />
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </div>
  );
}

type ChapterEntry = { chapterId: string; chapterLabel: string; sectionLabel: string; sheetIndex: number; number: number; pageIndex: number };

// Contents: sections, then chapters with the page each starts on (for this screen and text size).
export function ContentsPanel({
  pages,
  sheets,
  currentPageIndex,
  onGo,
  onClose,
}: {
  pages: BookPageData[];
  sheets: Sheet[];
  currentPageIndex: number;
  onGo: (sheetIndex: number) => void;
  onClose: () => void;
}) {
  const chapters: ChapterEntry[] = [];
  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0 && pages[pageIndex - 1].chapterId === page.chapterId) return;
    const sheetIndex = sheets.findIndex((sheet) => sheet.kind === "page" && sheet.pageIndex === pageIndex && sheet.part === 0);
    const sheet = sheets[sheetIndex];
    if (sheet?.kind !== "page") return;
    chapters.push({ chapterId: page.chapterId, chapterLabel: page.chapterLabel, sectionLabel: page.sectionLabel, sheetIndex, number: sheet.number, pageIndex });
  });
  const currentChapter = pages[currentPageIndex]?.chapterId;
  const sections: { label: string; chapters: ChapterEntry[] }[] = [];
  for (const chapter of chapters) {
    const last = sections.at(-1);
    if (last && last.label === chapter.sectionLabel) last.chapters.push(chapter);
    else sections.push({ label: chapter.sectionLabel, chapters: [chapter] });
  }

  return (
    <Panel title="Contents" onClose={onClose}>
      <div className="mx-auto max-w-2xl space-y-6">
        {sections.map((section, index) => (
          <section key={`${section.label}-${index}`} aria-label={section.label}>
            <h3 className="mb-2 text-base font-bold uppercase tracking-wide text-primary">{section.label}</h3>
            <ul className="space-y-2">
              {section.chapters.map((chapter) => {
                const here = chapter.chapterId === currentChapter;
                return (
                  <li key={chapter.chapterId}>
                    <button
                      type="button"
                      aria-current={here ? "true" : undefined}
                      data-autofocus={here ? "" : undefined}
                      onClick={() => onGo(chapter.sheetIndex)}
                      className={`flex min-h-14 w-full items-center justify-between gap-4 rounded-lg border-2 px-4 py-2 text-left text-lg text-ink hover:border-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        here ? "border-primary bg-primary/[0.06]" : "border-slate-300 bg-white"
                      }`}
                    >
                      <span className="min-w-0 [overflow-wrap:anywhere]">
                        <span className="font-semibold">{chapter.chapterLabel}</span>
                        {here && <span className="block text-base font-normal text-primary">You are here</span>}
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-base text-slate-700">Page {chapter.number}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  );
}

export function GoToPanel({ total, onGo, onClose }: { total: number; onGo: (number: number) => void; onClose: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  return (
    <Panel title="Go to page" onClose={onClose}>
      <form
        className="mx-auto max-w-md space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const number = Number(value);
          if (!Number.isInteger(number) || number < 1 || number > total) {
            setError(`Enter a page number from 1 to ${total}.`);
            return;
          }
          onGo(number);
        }}
      >
        <label htmlFor={inputId} className="block text-lg font-semibold text-ink">
          Page number <span className="font-normal text-slate-700">(1 to {total})</span>
        </label>
        <div className="flex gap-3">
          <input
            id={inputId}
            data-autofocus
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setValue(event.target.value.replace(/[^0-9]/g, "").slice(0, 5));
              setError(null);
            }}
            className="h-14 w-32 rounded-lg border-2 border-ink/40 px-4 text-2xl text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
          <button type="submit" className="inline-flex h-14 min-w-24 items-center justify-center rounded-lg bg-primary px-6 text-lg font-semibold text-white hover:bg-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Go
          </button>
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-lg font-semibold text-amber-900">
            {error}
          </p>
        )}
      </form>
    </Panel>
  );
}
