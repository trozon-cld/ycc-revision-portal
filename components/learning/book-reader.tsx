"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { buildSheets, DEFAULT_TEXT_SIZE, type BookPageData, type ResolvedMedia, type Sheet, type TextSize } from "@/lib/content/book";
import { getQuestionTypeDef } from "@/lib/questions/registry";
import { BlockList } from "./blocks";
import { FRESH_QUESTION_STATE, QuestionView, type QuestionViewState } from "./questions/question-view";
import { plainText } from "@/lib/content/inline";
import { collectMediaIds } from "@/lib/content/blocks";
import { ContentsPanel, GoToPanel, ReaderBar, ResultsPanel, type ReaderPanel, type ResultEntry } from "./reader-tools";

// A page's question is drawn several times (measuring layer, each sheet it spans); they share one
// state, keyed by the question's content so an edited question starts afresh.
type QuestionStates = Record<string, QuestionViewState>;
type QuestionBinding = { states: QuestionStates; setState: (key: string, state: QuestionViewState) => void };

// How a question looks after a wrong answer is checked: its tallest state before the explanation.
// With a typical wrong answer from its type, "Your answer" labels are measured too.
function checkedWrong(page: BookPageData): QuestionViewState {
  const data = page.question?.data;
  const sample = data ? getQuestionTypeDef(data.type)?.sampleWrongResponse?.(data.content, data.answer) : undefined;
  return { ...FRESH_QUESTION_STATE, phase: "checked", result: { answered: true, correct: false }, response: sample ?? null };
}

function measuresWrongAnswer(page: BookPageData): boolean {
  const data = page.question?.data;
  return Boolean(data && getQuestionTypeDef(data.type)?.sampleWrongResponse);
}

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
// Pages measured per step; a book this size or smaller is measured in one go, before it's shown.
const MEASURE_BATCH = 40;
// At the default text size a page that would spill onto the next page is fitted: question pictures
// shrink to half first, then the page's text steps down to this size at the smallest.
const FIT_MIN_SIZE = 14;
// Below this reader width the bar shows icons only, so it fits the smallest phones.
const TINY_BELOW = 380;

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
  tools = false,
  onTextSizeChange,
  resultsNote,
  initialPageId,
  onPageChange,
}: {
  pages: BookPageData[];
  media: ResolvedMedia;
  textSize: TextSize;
  label?: string;
  // Reports how many on-screen pages the content takes (used by the editor's readout).
  onLayout?: (info: LayoutInfo) => void;
  // The reader bar: Contents, Go to page, text size and the (future) Listen button.
  tools?: boolean;
  onTextSizeChange?: (size: TextSize) => void;
  // Shown under the Results tally, e.g. that a preview's results aren't saved.
  resultsNote?: string;
  // Opens at this authored page (e.g. where a candidate left off); unknown ids open at the start.
  initialPageId?: string | null;
  // Called with the authored page's id whenever the reader moves to another authored page.
  onPageChange?: (pageId: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const restRef = useRef<HTMLDivElement>(null);
  // Per page: the tallest a question's picture may be so the whole question fits on one page.
  const [pictureCaps, setPictureCaps] = useState<(number | null)[]>([]);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  // Sheets per authored page. Measured in batches: the current chapter first, then the rest in the
  // background, so a long book opens fast. Until every page is measured, later numbers are estimates.
  const [counts, setCounts] = useState<Counts | null>(null);
  const [batch, setBatch] = useState<number[]>([]);
  const [fits, setFits] = useState<{ id: object; list: (Fit | undefined)[] } | null>(null);
  const [position, setPosition] = useState(() => ({
    pageIndex: Math.max(0, initialPageId ? pages.findIndex((page) => page.id === initialPageId) : 0),
    part: 0,
  }));
  const [fontsReady, setFontsReady] = useState(0);
  const [questionStates, setQuestionStates] = useState<QuestionStates>({});
  const [panel, setPanel] = useState<ReaderPanel | null>(null);
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

  // A new identity whenever everything must be measured again.
  const layoutId = useMemo(() => ({}), [geometry, textSize, fontsReady, pages, media]);
  const current = counts && counts.id === layoutId ? counts : null;
  const fitting = textSize === DEFAULT_TEXT_SIZE;
  const fitList = fits && fits.id === layoutId ? fits.list : null;
  const sizeFor = useCallback(
    (index: number) => (fitting ? (fitList?.[index]?.size ?? textSize) : textSize),
    [fitting, fitList, textSize]
  );
  const countsRef = useRef(counts);
  countsRef.current = counts;
  const positionRef = useRef(position.pageIndex);
  positionRef.current = position.pageIndex;

  const nextBatch = useCallback(
    (fresh: boolean[] | null) => measureOrder(pages, positionRef.current).filter((index) => !fresh?.[index]).slice(0, MEASURE_BATCH),
    [pages]
  );

  // New layout: measure again, starting with the current chapter (before anything is painted).
  useLayoutEffect(() => {
    setBatch(nextBatch(null));
  }, [layoutId, nextBatch]);

  // Jumped to a chapter that isn't measured yet (e.g. from Contents): measure it now.
  useLayoutEffect(() => {
    const fresh = countsRef.current?.id === layoutId ? countsRef.current.fresh : null;
    if (!fresh?.[position.pageIndex]) setBatch(nextBatch(fresh));
  }, [position.pageIndex, layoutId, nextBatch]);

  // Feedback and explanations appear after Check, so a question page is measured again then.
  const previousStates = useRef(questionStates);
  useLayoutEffect(() => {
    const before = previousStates.current;
    previousStates.current = questionStates;
    const changed = pages.flatMap((page, index) => {
      const key = questionKey(page);
      return page.question && before[key] !== questionStates[key] ? [index] : [];
    });
    if (changed.length) setBatch((current) => [...new Set([...changed, ...current])]);
  }, [questionStates, pages]);

  useLayoutEffect(() => {
    const layer = measureRef.current;
    if (!layer || !geometry || batch.length === 0) return;
    // Question pictures get the height the rest of the question leaves (80px up to the usual 60%).
    // When fitting, that's the tallest state (wrong answer checked, explanation showing), down to half
    // the usual size; otherwise the checked state without the explanation, else while answering.
    const caps = [...pictureCaps];
    for (const index of batch) {
      const page = pages[index];
      if (!page?.question) continue;
      const size = sizeFor(index);
      const share = Math.round(geometry.contentHeight * PICTURE_SHARE);
      const pictureMargin = Math.ceil(size * 0.9) + 4;
      const roomFor = (state: string, extra: number) => {
        const rest = restRef.current?.querySelector<HTMLElement>(`[data-rest-page="${index}"][data-rest-state="${state}"]`);
        return rest ? geometry.contentHeight - rest.offsetHeight - pictureMargin - extra : -1;
      };
      // Types without a sample wrong answer keep one extra line for their "Your answer" label.
      const labelReserve = measuresWrongAnswer(page) ? 0 : Math.ceil(size * 1.4);
      if (fitting && !fitList?.[index]?.gaveUp) {
        const half = Math.max(QUESTION_PICTURE_MIN, Math.round(share / 2));
        const room = roomFor("full", labelReserve);
        caps[index] = room >= half ? Math.min(share, room) : half;
        continue;
      }
      caps[index] = share;
      for (const room of [roomFor("checked", labelReserve), roomFor("answering", 0)]) {
        if (room >= QUESTION_PICTURE_MIN) {
          caps[index] = Math.min(share, room);
          break;
        }
      }
    }
    if (caps.join() !== pictureCaps.join()) {
      setPictureCaps(caps);
      return;
    }

    const partsOf = (element: HTMLElement) =>
      Math.max(1, Math.round((element.scrollWidth + geometry.columnGap) / (geometry.contentWidth + geometry.columnGap)));

    // Fitting: one page at 16px, else 15, else 14; if even 14 spills, back to 16 and let it continue.
    if (fitting) {
      const list = [...(fitList ?? [])];
      let resized = false;
      for (const index of batch) {
        const fit = list[index];
        if (fit?.final) continue;
        const probe =
          layer.querySelector<HTMLElement>(`[data-fit-index="${index}"]`) ?? layer.querySelector<HTMLElement>(`[data-page-index="${index}"]`);
        if (!probe) continue;
        const size = fit?.size ?? textSize;
        if (partsOf(probe) <= 1) list[index] = { size, gaveUp: false, final: true };
        else if (size > FIT_MIN_SIZE) {
          list[index] = { size: size - 1, gaveUp: false, final: false };
          resized = true;
        } else {
          list[index] = { size: textSize, gaveUp: true, final: true };
          resized = true;
        }
      }
      if (JSON.stringify(list) !== JSON.stringify(fitList ?? [])) {
        setFits({ id: layoutId, list });
        if (resized) return;
      }
    }

    const step = geometry.contentWidth + geometry.columnGap;
    const previous = countsRef.current;
    const base = previous && previous.id === layoutId ? previous : null;
    const values = pages.map((_, index) => base?.values[index] ?? previous?.values[index] ?? null);
    const fresh = pages.map((_, index) => base?.fresh[index] ?? false);
    for (const child of Array.from(layer.children) as HTMLElement[]) {
      if (child.dataset.pageIndex === undefined) continue;
      const index = Number(child.dataset.pageIndex);
      values[index] = Math.max(1, Math.round((child.scrollWidth + geometry.columnGap) / step));
      fresh[index] = true;
    }
    const same = base && base.values.join() === values.join() && base.fresh.join() === fresh.join();
    if (!same) setCounts({ id: layoutId, values, fresh });

    // The rest of the book is measured a batch at a time, letting the reader paint in between.
    const next = nextBatch(fresh);
    if (next.length === 0) {
      setBatch([]);
      return;
    }
    const timer = window.setTimeout(() => setBatch(next), 0);
    return () => window.clearTimeout(timer);
  }, [geometry, batch, pictureCaps, pages, textSize, layoutId, nextBatch, fitting, fitList, sizeFor]);

  // Short books are re-measured before anything is painted, so their numbers are never estimates.
  const counted = Boolean(counts) && (pages.length <= MEASURE_BATCH || Boolean(current?.fresh.every(Boolean)));
  // Reported to the editors only once every page is fitted too.
  const complete = counted && (!fitting || pages.every((_, index) => fitList?.[index]?.final));
  // Short books keep every page in the measuring layer, as they always have; long ones only the batch.
  const measuring = useMemo(
    () => (pages.length <= MEASURE_BATCH ? pages.map((_, index) => index) : batch),
    [pages, batch]
  );
  // Pages not measured yet count as the average so far, so estimates stay close.
  const partCounts = useMemo(() => {
    if (!counts) return null;
    const known = counts.values.filter((value): value is number => value !== null);
    const average = known.length ? Math.max(1, Math.round(known.reduce((sum, value) => sum + value, 0) / known.length)) : 1;
    return pages.map((_, index) => counts.values[index] ?? average);
  }, [counts, pages]);
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
    if (panel || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      next();
    } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      previous();
    }
  }

  // How each question page went, for the Results panel.
  const results = useMemo<ResultEntry[]>(
    () =>
      pages.flatMap((page, pageIndex) => {
        if (!page.question) return [];
        const state = questionStates[questionKey(page)];
        const status =
          state?.phase === "checked" ? (state.result?.correct ? "correct" : "wrong") : state?.phase === "revealed" ? "revealed" : "open";
        const text = plainText(page.question.data.stemText).replace(/\s+/g, " ").trim();
        return [{ pageIndex, status, text: text.length > 90 ? `${text.slice(0, 89).trimEnd()}…` : text }];
      }),
    [pages, questionStates]
  );

  // Pictures on the next view start loading now, so turning the page shows them at once.
  const preloaded = useRef(new Set<string>());
  useEffect(() => {
    const ahead = sheets.slice(viewStart + perView, viewStart + perView * 2);
    for (const sheet of ahead) {
      if (sheet.kind !== "page") continue;
      const page = pages[sheet.pageIndex];
      for (const id of pageMediaIds(page)) {
        const src = media[id]?.src;
        if (!src || preloaded.current.has(src)) continue;
        preloaded.current.add(src);
        const image = new Image();
        image.decoding = "async";
        image.src = src;
      }
    }
  }, [sheets, viewStart, perView, pages, media]);

  const currentPageId = pages[position.pageIndex]?.id;
  const reportedPageId = useRef(currentPageId);
  useEffect(() => {
    if (!currentPageId || currentPageId === reportedPageId.current) return;
    reportedPageId.current = currentPageId;
    onPageChange?.(currentPageId);
  }, [currentPageId, onPageChange]);

  const totalPages = sheets.reduce((count, sheet) => (sheet.kind === "page" ? count + 1 : count), 0);
  const status = describeView(visible, totalPages, counted);

  useEffect(() => {
    if (!complete || !onLayout) return;
    onLayout({
      pages: totalPages,
      sizes: pages.map((_, index) => sizeFor(index)),
      tooLong: pages.map((_, index) => Boolean(fitList?.[index]?.gaveUp)),
    });
  }, [complete, totalPages, onLayout, pages, sizeFor, fitList]);
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
        // The usual limit before any per-page fitting; tap pictures never shrink below it on small pages.
        "--book-picture-share": `${Math.max(120, Math.round(geometry.contentHeight * PICTURE_SHARE))}px`,
      } as CSSProperties)
    : undefined;

  return (
    <section aria-label={label} onKeyDown={onKeyDown} className="flex h-full min-h-0 flex-col bg-slate-100 text-ink">
      {tools && (
        <ReaderBar
          compact={compact}
          tiny={(stageSize?.width ?? COMPACT_BELOW) < TINY_BELOW}
          ready={Boolean(partCounts)}
          panel={panel}
          onPanel={setPanel}
          textSize={textSize}
          onTextSizeChange={onTextSizeChange}
          hasQuestions={results.length > 0}
        />
      )}
      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden">
        {tools && panel === "contents" && (
          <ContentsPanel
            pages={pages}
            sheets={sheets}
            currentPageIndex={position.pageIndex}
            measured={current?.fresh ?? null}
            onGo={(sheetIndex) => {
              goTo(sheetIndex);
              setPanel(null);
            }}
            onClose={() => setPanel(null)}
          />
        )}
        {tools && panel === "results" && (
          <ResultsPanel
            entries={results}
            sheets={sheets}
            note={resultsNote}
            onGo={(sheetIndex) => {
              goTo(sheetIndex);
              setPanel(null);
            }}
            onReset={() => setQuestionStates({})}
            onClose={() => setPanel(null)}
          />
        )}
        {tools && panel === "goto" && (
          <GoToPanel
            total={totalPages}
            onGo={(number) => {
              goTo(sheets.findIndex((sheet) => sheet.kind === "page" && sheet.number === number));
              setPanel(null);
            }}
            onClose={() => setPanel(null)}
          />
        )}
        {geometry && (
          <>
            <div
              ref={measureRef}
              aria-hidden="true"
              className="pointer-events-none invisible absolute left-0 top-0 overflow-hidden"
              style={{ width: 0, height: 0, fontSize: textSize, ...sheetStyle, position: "absolute" }}
            >
              {measuring.map((index) => {
                const page = pages[index];
                if (!page) return null;
                const probe = fitting && page.question && !fitList?.[index]?.final;
                return [
                  <FlowColumns
                    key={page.id}
                    pageIndex={index}
                    page={page}
                    media={media}
                    geometry={geometry}
                    questions={questions}
                    pictureCap={pictureCaps[index] ?? null}
                    fontSize={sizeFor(index)}
                    baseSize={textSize}
                  />,
                  // The question in its tallest state, to test whether it fits one page.
                  probe && (
                    <FlowColumns
                      key={`${page.id}-fit`}
                      fitIndex={index}
                      page={page}
                      media={media}
                      geometry={geometry}
                      questions={questions}
                      pictureCap={pictureCaps[index] ?? null}
                      fontSize={sizeFor(index)}
                      baseSize={textSize}
                      stateOverride={checkedWrong(page)}
                    />
                  ),
                ];
              })}
            </div>
            {pages.some((page) => page.question) && (
              <div
                ref={restRef}
                aria-hidden="true"
                className="pointer-events-none invisible absolute left-0 top-0 overflow-hidden leading-[1.6] [&_[data-question-picture]]:hidden"
                style={{ width: 0, height: 0, fontSize: textSize }}
                inert
              >
                {measuring.map((index) => {
                  const page = pages[index];
                  if (!page?.question) return null;
                  const size = sizeFor(index);
                  const states = fitting && !fitList?.[index]?.gaveUp ? (["answering", "checked", "full"] as const) : (["answering", "checked"] as const);
                  return states.map((state) => (
                    <div
                      key={`${page.id}-${state}`}
                      data-rest-page={index}
                      data-rest-state={state}
                      // "full" keeps the explanation; the others leave it out.
                      className={state === "full" ? undefined : "[&_[data-question-explanation]]:hidden"}
                      style={{ width: geometry.contentWidth, ...(size !== textSize ? { fontSize: size } : {}) }}
                    >
                      <QuestionView
                        question={page.question!.data}
                        label={page.question!.label}
                        media={media}
                        state={state === "answering" ? FRESH_QUESTION_STATE : checkedWrong(page)}
                      />
                    </div>
                  ));
                })}
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
                      pageSize={sheet.kind === "page" ? sizeFor(sheet.pageIndex) : textSize}
                      textSize={textSize}
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
  pageIndex,
  fitIndex,
  fontSize,
  baseSize,
  stateOverride,
}: {
  pageIndex?: number;
  fitIndex?: number;
  // The page's own text size, when fitting made it smaller than the sheet's.
  fontSize?: number;
  baseSize?: number;
  stateOverride?: QuestionViewState;
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
      data-page-index={pageIndex}
      data-fit-index={fitIndex}
      style={{
        ...(fontSize && fontSize !== baseSize ? { fontSize } : {}),
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
          state={stateOverride ?? questions.states[key] ?? FRESH_QUESTION_STATE}
          onStateChange={stateOverride ? undefined : (state) => questions.setState(key, state)}
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
  pageSize,
  textSize,
  style,
  side,
}: {
  sheet: Sheet;
  pages: BookPageData[];
  media: ResolvedMedia;
  geometry: Geometry;
  questions: QuestionBinding;
  pictureCaps: (number | null)[];
  pageSize: number;
  textSize: number;
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
    <article aria-label={`Page ${sheet.number}`} className={`relative flex shrink-0 flex-col ${edge}`} style={style}>
      {page.badge && sheet.part === 0 && (
        <span className="absolute right-1.5 top-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-600/30">
          {page.badge}
        </span>
      )}
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
          fontSize={pageSize}
          baseSize={textSize}
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

function describeView(visible: Sheet[], total: number, exact: boolean) {
  const numbers = visible.flatMap((sheet) => (sheet.kind === "page" ? [sheet.number] : []));
  if (numbers.length === 0 || total === 0) return "";
  const of = exact ? `of ${total}` : `of about ${total}`;
  return numbers.length === 1 ? `Page ${numbers[0]} ${of}` : `Pages ${numbers[0]}–${numbers[1]} ${of}`;
}

// Every picture a page shows: blocks, the question picture and any pictures in its answers.
function pageMediaIds(page: BookPageData | undefined): string[] {
  if (!page) return [];
  if (!page.question) return collectMediaIds(page.blocks);
  const question = page.question.data;
  const def = getQuestionTypeDef(question.type);
  let own: string[] = [];
  try {
    own = def ? def.mediaIds(question.content) : [];
  } catch {
    own = [];
  }
  return [...(question.stemMediaId ? [question.stemMediaId] : []), ...own];
}

export type LayoutInfo = {
  pages: number;
  // Per authored page: its text size, and whether it doesn't fit one page even when fitted.
  sizes: number[];
  tooLong: boolean[];
};

type Fit = { size: number; gaveUp: boolean; final: boolean };

type Counts = { id: object; values: (number | null)[]; fresh: boolean[] };

// Which pages to measure first: the current chapter, then onwards, then the pages before it.
function measureOrder(pages: BookPageData[], current: number): number[] {
  const at = Math.min(Math.max(0, current), Math.max(0, pages.length - 1));
  const chapter = pages[at]?.chapterId;
  const inChapter = pages.flatMap((page, index) => (page.chapterId === chapter ? [index] : []));
  const after = pages.flatMap((_, index) => (index > at ? [index] : []));
  const before = pages.flatMap((_, index) => (index < at ? [index].reverse() : [])).reverse();
  return [...new Set([...inChapter, ...after, ...before])];
}
