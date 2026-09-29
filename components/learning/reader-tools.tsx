"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { TEXT_SIZES, type BookPageData, type Sheet, type TextSize } from "@/lib/content/book";

// The reader bar and its panels. Candidate style: big targets, words next to icons,
// high contrast. Panels cover the pages (no pop-up windows) and close with Escape.

export const barButton =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border-2 border-ink/25 bg-white font-semibold text-ink hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45 aria-pressed:border-primary aria-pressed:bg-primary/[0.08]";

export type ReaderPanel = "contents" | "goto" | "results";

// Whether the reader's buttons show their words (Contents, Close, Next…) or icons only. The reader
// provides it; each button keeps its name for screen readers and as a tooltip either way.
export const ReaderLabelsContext = createContext(true);

// Bar buttons on laptops and desktops (48px high), also used for the page's own items in the bar.
export const BAR_BUTTON_DENSE = "h-12 min-w-12 px-3 text-base";

export function ReaderBar({
  compact,
  tiny,
  ready,
  panel,
  onPanel,
  textSize,
  onTextSizeChange,
  hasQuestions,
  dense = false,
  narrow = false,
  start,
  end,
  status,
  onToggleLabels,
}: {
  compact: boolean;
  tiny: boolean;
  ready: boolean;
  panel: ReaderPanel | null;
  onPanel: (panel: ReaderPanel | null) => void;
  textSize: TextSize;
  onTextSizeChange?: (size: TextSize) => void;
  hasQuestions: boolean;
  // Laptops and desktops: one slimmer bar that also holds the page's own items at each end.
  dense?: boolean;
  // Under 1280px wide: no Listen yet (a placeholder); in the dense bar also short labels.
  narrow?: boolean;
  start?: ReactNode;
  end?: ReactNode;
  // Dense bar only: "Pages 5–6 of 11", shown between the tools (read out by the reader itself).
  status?: string;
  // Shows the "Labels" on/off button.
  onToggleLabels?: () => void;
}) {
  const showLabels = useContext(ReaderLabelsContext);
  const index = TEXT_SIZES.indexOf(textSize);
  const refs = { contents: useRef<HTMLButtonElement>(null), goto: useRef<HTMLButtonElement>(null), results: useRef<HTMLButtonElement>(null) };
  const previous = useRef(panel);
  // When a panel closes, focus goes back to the button that opened it.
  useEffect(() => {
    if (previous.current && !panel) refs[previous.current].current?.focus();
    previous.current = panel;
  });
  // Phones: the word sits under the icon so six controls fit; the smallest phones show icons only.
  const size = tiny
    ? "h-12 min-w-11 px-2 text-base"
    : dense
      ? BAR_BUTTON_DENSE
      : compact
      ? "h-14 min-w-12 flex-col gap-0 px-2 text-sm leading-tight"
      : "h-14 min-w-14 px-4 text-lg";
  // Smaller laptops with labels on: the word sits under the icon, so the page status keeps the middle.
  const panelSize = dense && narrow && showLabels ? "h-12 min-w-14 flex-col gap-0 px-2 text-sm leading-tight [&_svg]:size-5" : size;
  const toggle = (key: ReaderPanel) => onPanel(panel === key ? null : key);
  const panelButton = (key: ReaderPanel, icon: string, label: string, short: string) => (
    <button
      ref={refs[key]}
      type="button"
      aria-pressed={panel === key}
      disabled={!ready}
      onClick={() => toggle(key)}
      title={showLabels ? undefined : label}
      className={`${barButton} ${panelSize}`}
    >
      <Icon path={icon} />
      {tiny || !showLabels ? <span className="sr-only">{label}</span> : dense && narrow && short !== label ? (
        <>
          <span aria-hidden="true">{short}</span>
          <span className="sr-only">{label}</span>
        </>
      ) : compact && short !== label ? (
        <>
          <span aria-hidden="true">{short}</span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
  const leftTools = (
    <>
      {start && <div className="mr-2 flex shrink-0 items-center">{start}</div>}
      {panelButton("contents", "M4 6h16M4 12h16M4 18h10", "Contents", "Contents")}
      {panelButton("goto", "M6 3h9l4 4v14H6zM14 3v5h5", "Go to page", "Page")}
      {hasQuestions && panelButton("results", "M5 13l4 4L19 7", "Results", "Results")}
    </>
  );
  const rightTools = (
    <>
      {onToggleLabels && !compact && (
        <button
          type="button"
          aria-pressed={showLabels}
          onClick={onToggleLabels}
          title={showLabels ? "Hide button labels" : "Show button labels"}
          className={`${barButton} ${size}`}
        >
          <Icon path="M4 7h10l4 5-4 5H4zM8 12h4" />
          {showLabels && dense && !narrow ? <span>Labels</span> : <span className="sr-only">Button labels</span>}
        </button>
      )}
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
      {/* Reserved for reading aloud (phase 2); left out on phones, where there's no room for a button that does nothing yet. */}
      {!compact && !narrow && (
        <button type="button" disabled title="Listen is coming later" className={`${barButton} ${size}`}>
          <Icon path="M5 10v4h3l4 4V6L8 10zM15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
          <span className={showLabels ? undefined : "sr-only"}>Listen</span>
          <span className="sr-only"> (coming later)</span>
        </button>
      )}
      {end && <div className="ml-2 flex shrink-0 items-center gap-2 border-l border-slate-200 pl-4">{end}</div>}
    </>
  );
  // Dense bar: three columns, so the page status stays exactly in the middle whatever the buttons show.
  if (status) {
    return (
      <div
        role="toolbar"
        aria-label="Reader tools"
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-slate-300 bg-white px-6 py-2"
      >
        <div className="flex min-w-0 items-center gap-2">{leftTools}</div>
        <span aria-hidden="true" className="whitespace-nowrap px-2 text-center text-base font-medium text-ink">
          {status}
        </span>
        <div className="flex min-w-0 items-center justify-end gap-2">{rightTools}</div>
      </div>
    );
  }
  return (
    <div
      role="toolbar"
      aria-label="Reader tools"
      className={`flex items-center border-b border-slate-300 bg-white py-2 ${tiny ? "gap-1.5 px-2" : compact ? "gap-2 px-3" : "gap-2 px-6"}`}
    >
      {leftTools}
      <span className="flex-1" />
      {rightTools}
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
  const showLabels = useContext(ReaderLabelsContext);
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
        <button type="button" onClick={onClose} title={showLabels ? undefined : "Close"} className={`${barButton} h-12 min-w-12 px-3 text-base`}>
          <Icon path="M6 6l12 12M18 6L6 18" />
          <span className={showLabels ? "pr-1" : "sr-only"}>Close</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </div>
  );
}

type ChapterEntry = {
  chapterId: string;
  chapterLabel: string;
  sectionLabel: string;
  sheetIndex: number;
  number: number;
  pageIndex: number;
  exact: boolean;
};

// Contents: sections, then chapters with the page each starts on (for this screen and text size).
export function ContentsPanel({
  pages,
  sheets,
  currentPageIndex,
  measured,
  onGo,
  onClose,
}: {
  pages: BookPageData[];
  sheets: Sheet[];
  currentPageIndex: number;
  // Which pages are measured; a chapter's number is exact once every page before it is.
  measured: boolean[] | null;
  onGo: (sheetIndex: number) => void;
  onClose: () => void;
}) {
  const chapters: ChapterEntry[] = [];
  pages.forEach((page, pageIndex) => {
    if (pageIndex > 0 && pages[pageIndex - 1].chapterId === page.chapterId) return;
    const sheetIndex = sheets.findIndex((sheet) => sheet.kind === "page" && sheet.pageIndex === pageIndex && sheet.part === 0);
    const sheet = sheets[sheetIndex];
    if (sheet?.kind !== "page") return;
    const exact = Boolean(measured && measured.slice(0, pageIndex).every(Boolean));
    chapters.push({ chapterId: page.chapterId, chapterLabel: page.chapterLabel, sectionLabel: page.sectionLabel, sheetIndex, number: sheet.number, pageIndex, exact });
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
                      <span className="shrink-0 whitespace-nowrap text-base text-slate-700">
                        {chapter.exact ? `Page ${chapter.number}` : `About page ${chapter.number}`}
                      </span>
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
        className="mx-auto flex w-fit max-w-full flex-col items-center space-y-4 pt-4 text-center"
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
            className="h-14 w-32 rounded-lg border-2 border-ink/40 px-4 text-center text-2xl text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
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

export type ResultStatus = "correct" | "wrong" | "revealed" | "open";
export type ResultEntry = { pageIndex: number; status: ResultStatus; text: string };

const STATUS_TEXT: Record<ResultStatus, string> = { correct: "Correct", wrong: "Not quite", revealed: "Revealed", open: "Not tried yet" };
const STATUS_TONE: Record<ResultStatus, string> = {
  correct: "bg-green-50 text-green-900 ring-green-700/40",
  wrong: "bg-amber-50 text-amber-950 ring-amber-600/40",
  revealed: "bg-primary/[0.07] text-ink ring-primary/40",
  open: "bg-slate-100 text-slate-800 ring-slate-400/50",
};

// Results: how the questions went, with a way back to each one and a clean start.
export function ResultsPanel({
  entries,
  sheets,
  note,
  onGo,
  onReset,
  onClose,
}: {
  entries: ResultEntry[];
  sheets: Sheet[];
  note?: string;
  onGo: (sheetIndex: number) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const count = (status: ResultStatus) => entries.filter((entry) => entry.status === status).length;
  const correct = count("correct");
  const tried = entries.length - count("open");
  return (
    <Panel title="Results" onClose={onClose}>
      <div className="mx-auto max-w-2xl space-y-5">
        <div aria-live="polite">
          <p className="text-2xl font-bold text-ink">
            {correct} of {entries.length} {entries.length === 1 ? "question" : "questions"} correct
          </p>
          <p className="mt-1 text-lg text-slate-700">
            {count("wrong")} not quite · {count("revealed")} revealed · {count("open")} not tried yet
          </p>
          {note && <p className="mt-2 text-base text-slate-700">{note}</p>}
        </div>
        <ul className="space-y-2">
          {entries.map((entry, number) => {
            const sheetIndex = sheets.findIndex((sheet) => sheet.kind === "page" && sheet.pageIndex === entry.pageIndex && sheet.part === 0);
            const sheet = sheets[sheetIndex];
            return (
              <li key={entry.pageIndex}>
                <button
                  type="button"
                  onClick={() => onGo(sheetIndex)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-lg border-2 border-slate-300 bg-white px-4 py-2 text-left text-lg text-ink hover:border-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <span className="font-semibold">Question {number + 1}</span>
                    {sheet?.kind === "page" && <span className="text-base text-slate-700"> · page {sheet.number}</span>}
                    <span className="block text-base text-slate-700">{entry.text}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-base font-semibold ring-1 ${STATUS_TONE[entry.status]}`}>
                    {STATUS_TEXT[entry.status]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {entries.length > 0 && (
          <button
            type="button"
            aria-disabled={tried === 0 || undefined}
            onClick={() => tried > 0 && onReset()}
            className="inline-flex h-14 items-center justify-center rounded-lg border-2 border-ink/25 bg-white px-5 text-lg font-semibold text-ink hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-45"
          >
            Clear all answers
          </button>
        )}
      </div>
    </Panel>
  );
}
