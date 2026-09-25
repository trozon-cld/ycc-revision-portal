"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { buildSheets, type BookPageData, type ResolvedMedia, type Sheet, type TextSize } from "@/lib/content/book";
import { BlockList } from "./blocks";
import { FRESH_QUESTION_STATE, QuestionView, type QuestionViewState } from "./questions/question-view";

// A page's question is drawn several times (measuring layer, each sheet it spans); they share one
// state, keyed by the question's content so an edited question starts afresh.
type QuestionStates = Record<string, QuestionViewState>;
type QuestionBinding = { states: QuestionStates; setState: (key: string, state: QuestionViewState) => void };

// How a question looks after a wrong answer is checked: its tallest state before the explanation.
const CHECKED_WRONG: QuestionViewState = { ...FRESH_QUESTION_STATE, phase: "checked", result: { answered: true, correct: false } };

function questionKey(page: BookPageData): string {
  return page.question ? `${page.id}:${JSON.stringify(page.question)}` : page.id;
}

// Fixed-size book sheets. Each authored page is laid out in CSS columns one sheet wide; extra
// columns become extra sheets. Spread (two sheets) when the reader is at least 1024px wide.

const SPREAD_MIN_WIDTH = 1024;
const SHEET_RATIO = 0.75; // width / height of a sheet in a spread
const STAGE_PADDING = 12;
const NARROW_SHEET = 480;
const PICTURE_SHARE = 0.6;
const QUESTION_PICTURE_MIN = 80;
const COMPACT_BELOW = 600;

type Geometry = {
  spread: boolean;
  sheetWidth: number;
  sheetHeight: number;
  padX: number;
  headerHeight: number;
  contentTop: number;
  footerHeight: number;
  contentWidth: number;
  contentHeight: number;
  columnGap: number;
};

function computeGeometry(width: number, height: number, textSize: TextSize): Geometry | null {
  const availableWidth = width - STAGE_PADDING * 2;
  const availableHeight = height - STAGE_PADDING * 2;
  if (availableWidth < 200 || availableHeight < 200) return null;

  const spread = width >= SPREAD_MIN_WIDTH;
  const sheetHeight = Math.floor(availableHeight);
  const sheetWidth = Math.floor(spread ? Math.min(availableWidth / 2, sheetHeight * SHEET_RATIO) : availableWidth);
  const padX = Math.round(Math.min(56, Math.max(20, sheetWidth * 0.08)));
  const headerHeight = Math.round(textSize * 2.6);
  const contentTop = Math.round(textSize * 0.9);
  const footerHeight = Math.round(textSize * 2.4);
  const contentWidth = sheetWidth - padX * 2;
  const contentHeight = sheetHeight - headerHeight - contentTop - footerHeight;
  return {
    spread,
    sheetWidth,
    sheetHeight,
    padX,
    headerHeight,
    contentTop,
    footerHeight,
    contentWidth,
    contentHeight,
    columnGap: padX * 2,
  };
}

export function BookReader({
  pages,
  media,
  textSize,
  label = "Handbook",
  onLayout,
}: {
  pages: BookPageData[];
  media: ResolvedMedia;
  textSize: TextSize;
  label?: string;
  // Reports how many on-screen pages the content takes (used by the editor's readout).
  onLayout?: (info: { pages: number }) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const restRef = useRef<HTMLDivElement>(null);
  // Per page: the tallest a question's picture may be so the whole question fits on one page.
  const [pictureCaps, setPictureCaps] = useState<(number | null)[]>([]);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const [partCounts, setPartCounts] = useState<number[] | null>(null);
  const [position, setPosition] = useState({ pageIndex: 0, part: 0 });
  const [fontsReady, setFontsReady] = useState(0);
  const [questionStates, setQuestionStates] = useState<QuestionStates>({});
  const questions = useMemo<QuestionBinding>(
    () => ({ states: questionStates, setState: (key, state) => setQuestionStates((current) => ({ ...current, [key]: state })) }),
    [questionStates]
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStageSize((current) =>
        current && Math.round(current.width) === Math.round(width) && Math.round(current.height) === Math.round(height)
          ? current
          : { width, height }
      );
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Text measured before the web font arrives would page differently, so measure again after.
  useEffect(() => {
    let cancelled = false;
    document.fonts?.ready.then(() => !cancelled && setFontsReady((n) => n + 1));
    return () => {
      cancelled = true;
    };
  }, []);

  const geometry = useMemo(
    () => (stageSize ? computeGeometry(stageSize.width, stageSize.height, textSize) : null),
    [stageSize, textSize]
  );

  useLayoutEffect(() => {
    const layer = measureRef.current;
    if (!layer || !geometry) return;
    // A question page's picture gets the height left by the rest of the question (measured without
    // picture or explanation), within 80px and the usual 60%: first so it all fits even after Check
    // (one extra line kept for a "Your answer" label), else so it fits while answering.
    const caps = pages.map((page, index) => {
      if (!page.question) return null;
      const share = Math.round(geometry.contentHeight * PICTURE_SHARE);
      const pictureMargin = Math.ceil(textSize * 0.9) + 4;
      const roomFor = (state: string, extra: number) => {
        const rest = restRef.current?.querySelector<HTMLElement>(`[data-rest-page="${index}"][data-rest-state="${state}"]`);
        return rest ? geometry.contentHeight - rest.offsetHeight - pictureMargin - extra : -1;
      };
      for (const room of [roomFor("checked", Math.ceil(textSize * 1.4)), roomFor("answering", 0)]) {
        if (room >= QUESTION_PICTURE_MIN) return Math.min(share, room);
      }
      return share;
    });
    setPictureCaps((current) => (current.join() === caps.join() ? current : caps));
    const step = geometry.contentWidth + geometry.columnGap;
    const counts = Array.from(layer.children, (child) =>
      Math.max(1, Math.round(((child as HTMLElement).scrollWidth + geometry.columnGap) / step))
    );
    setPartCounts((current) => (current && current.join() === counts.join() ? current : counts));
    // Feedback and explanations appear after Check, so a question page is measured again then.
  }, [geometry, pages, media, fontsReady, questionStates, pictureCaps, textSize]);

  const sheets = useMemo(
    () => (partCounts && geometry ? buildSheets(pages, partCounts, geometry.spread) : []),
    [pages, partCounts, geometry]
  );

  // Keep the reader on the same authored page when the layout changes.
  const currentSheetIndex = useMemo(() => {
    if (sheets.length === 0) return 0;
    const exact = sheets.findIndex(
      (sheet) => sheet.kind === "page" && sheet.pageIndex === position.pageIndex && sheet.part === Math.min(position.part, sheet.parts - 1)
    );
    return exact === -1 ? 0 : exact;
  }, [sheets, position]);

  const perView = geometry?.spread ? 2 : 1;
  const viewStart = Math.floor(currentSheetIndex / perView) * perView;
  const visible = sheets.slice(viewStart, viewStart + perView);
  const canGoBack = viewStart > 0;
  const canGoForward = viewStart + perView < sheets.length;

  const goTo = useCallback(
    (sheetIndex: number) => {
      const clamped = Math.max(0, Math.min(sheets.length - 1, sheetIndex));
      // A blank filler sheet has no page of its own; land on its neighbour.
      const target = sheets[clamped]?.kind === "page" ? sheets[clamped] : sheets[clamped + 1] ?? sheets[clamped - 1];
      if (target?.kind === "page") setPosition({ pageIndex: target.pageIndex, part: target.part });
    },
    [sheets]
  );

  const next = () => canGoForward && goTo(viewStart + perView);
  const previous = () => canGoBack && goTo(viewStart - perView);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      next();
    } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      previous();
    }
  }

  const totalPages = sheets.reduce((count, sheet) => (sheet.kind === "page" ? count + 1 : count), 0);
  const status = describeView(visible, totalPages);

  useEffect(() => {
    if (partCounts && onLayout) onLayout({ pages: totalPages });
  }, [partCounts, totalPages, onLayout]);
  const shortStatus = status.replace(/^Pages? /, "");
  // Sized from the reader's own width (not the screen), so previews match real devices.
  const compact = (stageSize?.width ?? COMPACT_BELOW) < COMPACT_BELOW;

  const sheetStyle = geometry
    ? ({
        width: geometry.sheetWidth,
        height: geometry.sheetHeight,
        fontSize: textSize,
        // Pictures take at most ~60% of the page height, so they can share a page with their text.
        "--book-picture-max": `${Math.max(120, Math.round(geometry.contentHeight * PICTURE_SHARE))}px`,
      } as CSSProperties)
    : undefined;

  return (
    <section aria-label={label} onKeyDown={onKeyDown} className="flex h-full min-h-0 flex-col bg-slate-100 text-ink">
      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden">
        {geometry && (
          <>
            <div
              ref={measureRef}
              aria-hidden="true"
              className="pointer-events-none invisible absolute left-0 top-0 overflow-hidden"
              style={{ width: 0, height: 0, fontSize: textSize, ...sheetStyle, position: "absolute" }}
            >
              {pages.map((page, index) => (
                <FlowColumns
                  key={page.id}
                  page={page}
                  media={media}
                  geometry={geometry}
                  questions={questions}
                  pictureCap={pictureCaps[index] ?? null}
                />
              ))}
            </div>
            {pages.some((page) => page.question) && (
              <div
                ref={restRef}
                aria-hidden="true"
                className="pointer-events-none invisible absolute left-0 top-0 overflow-hidden leading-[1.6] [&_[data-question-explanation]]:hidden [&_[data-question-picture]]:hidden"
                style={{ width: 0, height: 0, fontSize: textSize }}
                inert
              >
                {pages.map((page, index) =>
                  page.question
                    ? (["answering", "checked"] as const).map((state) => (
                        <div key={`${page.id}-${state}`} data-rest-page={index} data-rest-state={state} style={{ width: geometry.contentWidth }}>
                          <QuestionView
                            question={page.question!.data}
                            label={page.question!.label}
                            media={media}
                            state={state === "checked" ? CHECKED_WRONG : FRESH_QUESTION_STATE}
                          />
                        </div>
                      ))
                    : null
                )}
              </div>
            )}

            {partCounts && (
              <div className="flex h-full items-center justify-center" style={{ padding: STAGE_PADDING }}>
                <div className={`flex ${geometry.spread ? "shadow-xl" : "shadow-md"}`}>
                  {visible.map((sheet, index) => (
                    <SheetView
                      key={sheet.kind === "page" ? `${sheet.pageIndex}-${sheet.part}` : `blank-${viewStart + index}`}
                      sheet={sheet}
                      pages={pages}
                      media={media}
                      geometry={geometry}
                      questions={questions}
                      pictureCaps={pictureCaps}
                      style={sheetStyle}
                      side={geometry.spread ? (index === 0 ? "left" : "right") : "single"}
                    />
                  ))}
                  {geometry.spread && visible.length === 1 && <div aria-hidden="true" style={{ width: geometry.sheetWidth }} />}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <nav
        aria-label="Page controls"
        className={`flex items-center justify-between gap-3 border-t border-slate-300 bg-white py-3 ${compact ? "px-3" : "px-6"}`}
      >
        <PageButton direction="previous" compact={compact} disabled={!canGoBack} onClick={previous} />
        <p className="min-w-0 whitespace-nowrap text-center text-lg font-medium text-ink">
          <span aria-hidden="true">{compact ? shortStatus : status}</span>
          <span className="sr-only" aria-live="polite">
            {status}
          </span>
        </p>
        <PageButton direction="next" compact={compact} disabled={!canGoForward} onClick={next} />
      </nav>
    </section>
  );
}

function PageButton({
  direction,
  compact,
  disabled,
  onClick,
}: {
  direction: "previous" | "next";
  compact: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const isNext = direction === "next";
  const tone = isNext
    ? "bg-primary text-white hover:bg-primary/90"
    : "border-2 border-ink/25 bg-white text-ink hover:bg-slate-50";
  const size = compact ? "size-14" : "h-14 min-w-36 gap-2 px-5";
  const arrow = (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={compact ? "size-7" : "size-5"} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={isNext ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"} />
    </svg>
  );
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={compact ? (isNext ? "Next page" : "Previous page") : undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-xl text-lg font-semibold transition-colors focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40 ${tone} ${size}`}
    >
      {!isNext && arrow}
      {!compact && (isNext ? "Next" : "Previous")}
      {isNext && arrow}
    </button>
  );
}

function FlowColumns({
  page,
  media,
  geometry,
  questions,
  pictureCap = null,
  offset = 0,
}: {
  page: BookPageData;
  media: ResolvedMedia;
  geometry: Geometry;
  questions: QuestionBinding;
  pictureCap?: number | null;
  offset?: number;
}) {
  const key = questionKey(page);
  const questionStyle = page.question
    ? ({ position: "relative", ...(pictureCap ? { "--book-picture-max": `${pictureCap}px` } : {}) } as CSSProperties)
    : undefined;
  return (
    <div
      className="leading-[1.6]"
      style={{
        width: geometry.contentWidth,
        height: geometry.contentHeight,
        columnWidth: geometry.contentWidth,
        columnGap: geometry.columnGap,
        columnFill: "auto",
        transform: offset ? `translateX(-${offset * (geometry.contentWidth + geometry.columnGap)}px)` : undefined,
        ...questionStyle,
      }}
    >
      {page.question ? (
        <QuestionView
          question={page.question.data}
          label={page.question.label}
          media={media}
          state={questions.states[key] ?? FRESH_QUESTION_STATE}
          onStateChange={(state) => questions.setState(key, state)}
        />
      ) : (
        <BlockList blocks={page.blocks} media={media} />
      )}
    </div>
  );
}

function SheetView({
  sheet,
  pages,
  media,
  geometry,
  questions,
  pictureCaps,
  style,
  side,
}: {
  sheet: Sheet;
  pages: BookPageData[];
  media: ResolvedMedia;
  geometry: Geometry;
  questions: QuestionBinding;
  pictureCaps: (number | null)[];
  style?: CSSProperties;
  side: "left" | "right" | "single";
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const page = sheet.kind === "page" ? pages[sheet.pageIndex] : null;
  const part = sheet.kind === "page" ? sheet.part : 0;

  // Question pages: each part (option, button, explanation…) is live only on the sheet that shows it,
  // so keyboard and screen readers meet it once, and never focus something that isn't visible.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || !page?.question) return;
    const step = geometry.contentWidth + geometry.columnGap;
    box.querySelectorAll<HTMLElement>("[data-flow-unit]").forEach((unit) => {
      unit.inert = Math.floor((unit.offsetLeft + 1) / step) !== part;
    });
  });
  const edge =
    side === "left"
      ? "bg-gradient-to-l from-slate-200/70 via-white via-[3%] to-white"
      : side === "right"
        ? "bg-gradient-to-r from-slate-200/70 via-white via-[3%] to-white"
        : "bg-white rounded-sm";

  if (sheet.kind === "blank") {
    return <div aria-hidden="true" className={`shrink-0 ${edge}`} style={style} />;
  }

  if (!page) return null;
  // Later parts of a page repeat its text for layout only; screen readers get it once, from the first part.
  // Question pages instead expose each part on the sheet where it shows (see above).
  const repeat = sheet.part > 0 && !page.question;
  return (
    <article aria-label={`Page ${sheet.number}`} className={`flex shrink-0 flex-col ${edge}`} style={style}>
      <header
        className="flex items-end justify-between gap-3 overflow-hidden border-b border-slate-200 pb-[0.35em] text-[0.72em] text-slate-700"
        style={{ height: geometry.headerHeight, marginLeft: geometry.padX, marginRight: geometry.padX }}
      >
        {/* Narrow sheets (phones) show only the chapter, so neither name is cut to a few letters. */}
        {geometry.sheetWidth >= NARROW_SHEET && <span className="truncate">{page.sectionLabel}</span>}
        <span className={`truncate font-medium text-ink ${geometry.sheetWidth >= NARROW_SHEET ? "text-right" : ""}`}>
          {page.chapterLabel}
        </span>
      </header>

      <div
        ref={boxRef}
        className="overflow-hidden"
        // Nothing may scroll a sheet sideways (e.g. find-in-page); that would show the wrong part.
        onScroll={(event) => {
          event.currentTarget.scrollLeft = 0;
          event.currentTarget.scrollTop = 0;
        }}
        aria-hidden={repeat || undefined}
        // Repeats are also out of reach of the keyboard (a question's buttons, for example).
        inert={repeat || undefined}
        style={{
          width: geometry.contentWidth,
          height: geometry.contentHeight,
          marginLeft: geometry.padX,
          marginTop: geometry.contentTop,
        }}
      >
        <FlowColumns
          page={page}
          media={media}
          geometry={geometry}
          questions={questions}
          pictureCap={pictureCaps[sheet.pageIndex] ?? null}
          offset={sheet.part}
        />
      </div>

      <footer
        aria-hidden="true"
        className="flex items-center justify-center text-[0.8em] text-slate-700"
        style={{ height: geometry.footerHeight }}
      >
        {sheet.number}
      </footer>
    </article>
  );
}

function describeView(visible: Sheet[], total: number) {
  const numbers = visible.flatMap((sheet) => (sheet.kind === "page" ? [sheet.number] : []));
  if (numbers.length === 0 || total === 0) return "";
  return numbers.length === 1 ? `Page ${numbers[0]} of ${total}` : `Pages ${numbers[0]}–${numbers[1]} of ${total}`;
}
