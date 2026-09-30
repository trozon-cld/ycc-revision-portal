"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { buildSheets, type BookPageData, type ResolvedMedia, type Sheet, type TextSize } from "@/lib/content/book";
import type { BookCovers } from "@/lib/content/covers";
import { PHONE_SIDEWAYS_QUERY } from "@/lib/layout";
import { BackCoverFace, FrontCoverFace } from "./book-covers";
import { getQuestionTypeDef } from "@/lib/questions/registry";
import { BlockList } from "./blocks";
import { FRESH_QUESTION_STATE, QuestionView, type QuestionViewState } from "./questions/question-view";
import { plainText } from "@/lib/content/inline";
import { collectMediaIds } from "@/lib/content/blocks";
import {
  ContentsPanel,
  GoToPanel,
  ReaderBar,
  ReaderLabelsContext,
  ResultsPanel,
  PANEL_LINK,
  SettingsPanel,
  type ReaderPanel,
  type ResultEntry,
} from "./reader-tools";

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
// columns become extra sheets. Spread (two sheets) when the reader is at least 1024px wide; on touch
// screens (tablets) only in landscape and when each page has room for TOUCH_SPREAD_MIN_EMS.

const SPREAD_MIN_WIDTH = 1024;
const SHEET_RATIO = 0.95; // widest a sheet in a spread may be, as width / height
// ...and never wider than this many ems, so lines stay easy to read on big screens.
const SHEET_MAX_EMS = 42;
const STAGE_PADDING = 12;
const NARROW_SHEET = 480;
const PICTURE_SHARE = 0.6;
const QUESTION_PICTURE_MIN = 80;
const COMPACT_BELOW = 600;
// Pages measured per step; a book this size or smaller is measured in one go, before it's shown.
const MEASURE_BATCH = 40;
// A page that would spill onto the next page is fitted first: question pictures shrink (to half at
// most), then its text steps down FIT_STEPS px (never below FIT_MIN_SIZE), then content pictures
// shrink to CONTENT_PICTURE_FIT of the page height. Only a page that still doesn't fit continues.
const FIT_MIN_SIZE = 14;
const FIT_STEPS = 2;
const CONTENT_PICTURE_FIT = 0.4;
// Spreads (laptops, desktops) have Previous/Next beside the pages; this is the room each side takes.
const SIDE_NAV = 88;
const TOUCH_SPREAD_MIN_EMS = 26;
// A horizontal swipe of at least this many px (and mostly sideways, fairly quick) turns the page.
const SWIPE_MIN = 50;
const SWIPE_MAX_MS = 800;
// Below this width (tablets held upright) the bar's words sit under the icons, so it fits.
const STACKED_BAR_BELOW = 820;
// This browser's choice of button labels on or off (a small display preference, not saved to the account).
const LABELS_KEY = "ycc-reader-labels";
const SPREAD_PADDING = 8;
// Below this width the laptop bar uses short labels and leaves out Listen, so everything fits.
const ROOMY_BAR = 1280;
// Spreads: picture answer options are at most this share of the page height, so a question keeps room
// for its explanation.
const OPTION_PICTURE_SHARE = 0.22;
// Fitting a question may shrink its picture down to this share of the usual limit.
const QUESTION_PICTURE_FIT = 0.25;
// Last fitting step, as shares of the page height: a question's own picture and its answer pictures.
const QUESTION_PICTURE_LAST = 0.15;
// First fitting step for a question: its spacing at this share of the usual.
const COMPACT_SPACE = 0.5;
const OPTION_PICTURE_LAST = 0.15;
// Below this reader width the bar shows icons only, so it fits the smallest phones.
const TINY_BELOW = 380;
// The reader's position on the front cover; the back cover is pages.length.
const FRONT_COVER = -1;
// This browser's choice of the page-turn animation (on unless switched off; never with reduced motion).
const PAGE_TURN_KEY = "ycc-reader-page-turn";
const TURN_MS_SPREAD = 520;
const TURN_MS_SINGLE = 400;

// Previous/Next with the animation on: the view being left and the one arriving, drawn over the
// (already live) new view until the turning page lands. Jumps (Contents, Go to page) don't animate.
type Turn = { id: number; direction: "forward" | "back"; from: Sheet[]; to: Sheet[] };

type Geometry = {
  spread: boolean;
  // Reader at least 1024px wide: Previous/Next beside the pages, slimmer running header.
  wide: boolean;
  touch: boolean;
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

// With a mouse or trackpad (`touch` false) this is exactly the laptop and desktop layout.
// `sideways` (a phone on its side) borrows the wide layout: one page with Previous/Next beside it.
function computeGeometry(width: number, height: number, textSize: TextSize, touch: boolean, sideways = false): Geometry | null {
  const wide = width >= SPREAD_MIN_WIDTH || sideways;
  const padding = wide ? SPREAD_PADDING : STAGE_PADDING;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;
  if (availableWidth < 200 || availableHeight < 200) return null;

  const sheetHeight = Math.floor(availableHeight);
  const pairWidth = (availableWidth - SIDE_NAV * 2) / 2;
  const spread = width >= SPREAD_MIN_WIDTH && (!touch || (width > height && pairWidth >= textSize * TOUCH_SPREAD_MIN_EMS));
  const sheetWidth = Math.floor(
    spread
      ? Math.min(pairWidth, sheetHeight * SHEET_RATIO, textSize * SHEET_MAX_EMS)
      : wide
        ? Math.min(availableWidth - SIDE_NAV * 2, textSize * SHEET_MAX_EMS)
        : availableWidth
  );
  const padX = Math.round(Math.min(wide ? 44 : 56, Math.max(20, sheetWidth * (wide ? 0.07 : 0.08))));
  // Wide readers keep the running header and page number slimmer, leaving more of the page for content.
  const headerHeight = Math.round(textSize * (wide ? 2.1 : 2.6));
  const contentTop = Math.round(textSize * (wide ? 0.7 : 0.9));
  const footerHeight = Math.round(textSize * (wide ? 1.9 : 2.4));
  const contentWidth = sheetWidth - padX * 2;
  const contentHeight = sheetHeight - headerHeight - contentTop - footerHeight;
  return {
    spread,
    wide,
    touch,
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
  barStart,
  barEnd,
  covers,
  homeHref,
  accountLinks,
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
  // Extra items at the ends of the reader bar on laptops and desktops (e.g. the logo, Help, Log out).
  barStart?: ReactNode;
  barEnd?: ReactNode;
  // A category's whole book: unnumbered front and back covers. A new reader opens on the front cover.
  covers?: BookCovers;
  // Candidate page on phones: the header is hidden, so the bar gets a Home button and Settings gets
  // Back to home plus these links (Help, Log out).
  homeHref?: string;
  accountLinks?: ReactNode;
}) {
  const sectionRef = useRef<HTMLElement>(null);
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
  const [position, setPosition] = useState(() => {
    const found = initialPageId ? pages.findIndex((page) => page.id === initialPageId) : -1;
    return { pageIndex: found >= 0 ? found : covers ? FRONT_COVER : 0, part: 0 };
  });
  const [fontsReady, setFontsReady] = useState(0);
  const [questionStates, setQuestionStates] = useState<QuestionStates>({});
  const [panel, setPanel] = useState<ReaderPanel | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [pageTurn, setPageTurn] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [turn, setTurn] = useState<Turn | null>(null);
  // Touch screens (tablets, phones): swipe to turn, 56px answers, and two pages only when there's room.
  // Read after the first render, so the server's HTML and the browser's first render match.
  const [touch, setTouch] = useState(false);
  const turnCount = useRef(0);
  const swipe = useRef<{ id: number; x: number; y: number; t: number } | null>(null);
  const swipedAt = useRef(-Infinity);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(LABELS_KEY) === "off") setShowLabels(false);
      if (window.localStorage.getItem(PAGE_TURN_KEY) === "off") setPageTurn(false);
    } catch {
      // Storage can be blocked (private windows); the defaults simply stay.
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const update = () => {
      setReducedMotion(query.matches);
      setTouch(coarse.matches);
    };
    update();
    query.addEventListener("change", update);
    coarse.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
      coarse.removeEventListener("change", update);
    };
  }, []);
  const togglePageTurn = useCallback(() => {
    setPageTurn((current) => {
      try {
        window.localStorage.setItem(PAGE_TURN_KEY, current ? "off" : "on");
      } catch {
        // Not remembered, but still switched for this visit.
      }
      return !current;
    });
  }, []);
  const toggleLabels = useCallback(() => {
    setShowLabels((current) => {
      try {
        window.localStorage.setItem(LABELS_KEY, current ? "off" : "on");
      } catch {
        // Not remembered, but still switched for this visit.
      }
      return !current;
    });
  }, []);
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

  const sideways = useSyncExternalStore(
    subscribeSideways,
    () => Boolean(homeHref) && window.matchMedia(PHONE_SIDEWAYS_QUERY).matches,
    () => false
  );
  const geometry = useMemo(
    () => (stageSize ? computeGeometry(stageSize.width, stageSize.height, textSize, touch, sideways) : null),
    [stageSize, textSize, touch, sideways]
  );

  // A new identity whenever everything must be measured again.
  const layoutId = useMemo(() => ({}), [geometry, textSize, fontsReady, pages, media]);
  const current = counts && counts.id === layoutId ? counts : null;
  const fitList = fits && fits.id === layoutId ? fits.list : null;
  const fitFloor = Math.max(FIT_MIN_SIZE, textSize - FIT_STEPS);
  const sizeFor = useCallback((index: number) => fitList?.[index]?.size ?? textSize, [fitList, textSize]);
  // Smaller picture limits once a page's text is as small as fitting allows (the last step before it
  // continues on the next page): content pictures, and a question's own and answer pictures.
  const capFor = useCallback(
    (index: number): number | null => {
      const small = Boolean(fitList?.[index]?.smallPictures && geometry);
      if (pages[index]?.question) {
        const cap = pictureCaps[index] ?? null;
        return small && geometry ? Math.min(cap ?? Infinity, Math.round(geometry.contentHeight * QUESTION_PICTURE_LAST)) : cap;
      }
      return small && geometry ? Math.round(geometry.contentHeight * CONTENT_PICTURE_FIT) : null;
    },
    [pages, pictureCaps, fitList, geometry]
  );
  const optionCapFor = useCallback(
    (index: number): number | null =>
      fitList?.[index]?.smallPictures && pages[index]?.question && geometry ? Math.round(geometry.contentHeight * OPTION_PICTURE_LAST) : null,
    [pages, fitList, geometry]
  );
  const countsRef = useRef(counts);
  countsRef.current = counts;
  // The authored page nearest the reader (a cover counts as the first or last page) for measuring order.
  const nearestPage = Math.min(Math.max(0, position.pageIndex), Math.max(0, pages.length - 1));
  const positionRef = useRef(nearestPage);
  positionRef.current = nearestPage;

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
    if (!fresh?.[nearestPage]) setBatch(nextBatch(fresh));
  }, [nearestPage, layoutId, nextBatch]);

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
    // Question pictures get the height the rest of the question leaves (80px up to the usual 60%) in its
    // tallest state (wrong answer checked, explanation showing), down to half the usual size. A question
    // that can't fit even then keeps the checked state without the explanation, else while answering.
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
      if (!fitList?.[index]?.gaveUp) {
        const half = Math.max(QUESTION_PICTURE_MIN, Math.round(share * QUESTION_PICTURE_FIT));
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

    // Fitting, e.g. at 18px: one page at 18, else 17, else 16 (then smaller content pictures); if it
    // still spills, back to 18 with the usual pictures, and it continues on the next page.
    {
      const list = [...(fitList ?? [])];
      let resized = false;
      for (const index of batch) {
        const fit = list[index];
        if (fit?.final) continue;
        const probe =
          layer.querySelector<HTMLElement>(`[data-fit-index="${index}"]`) ?? layer.querySelector<HTMLElement>(`[data-page-index="${index}"]`);
        if (!probe) continue;
        const size = fit?.size ?? textSize;
        const smallPictures = fit?.smallPictures ?? false;
        const compact = fit?.compact ?? false;
        const page = pages[index];
        const step = { size, smallPictures, compact, gaveUp: false, scroll: false, final: false };
        if (partsOf(probe) <= 1) list[index] = { ...step, final: true };
        else if (page?.question && !compact) list[index] = { ...step, compact: true };
        else if (size > fitFloor) list[index] = { ...step, size: size - 1 };
        else if (!smallPictures && page && pageMediaIds(page).length > 0) list[index] = { ...step, smallPictures: true };
        // A question never continues on another page: as it is now, it scrolls within its page.
        else if (page?.question) list[index] = { ...step, scroll: true, final: true };
        else list[index] = { size: textSize, smallPictures: false, compact: false, gaveUp: true, scroll: false, final: true };
        if (!list[index]?.final || list[index]?.scroll || list[index]?.gaveUp) resized = true;
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
      values[index] = fitList?.[index]?.scroll ? 1 : Math.max(1, Math.round((child.scrollWidth + geometry.columnGap) / step));
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
  }, [geometry, batch, pictureCaps, pages, textSize, layoutId, nextBatch, fitList, fitFloor, sizeFor]);

  // Short books are re-measured before anything is painted, so their numbers are never estimates.
  const counted = Boolean(counts) && (pages.length <= MEASURE_BATCH || Boolean(current?.fresh.every(Boolean)));
  // Reported to the editors only once every page is fitted too.
  const complete = counted && pages.every((_, index) => fitList?.[index]?.final);
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
    () => (partCounts && geometry ? buildSheets(pages, partCounts, geometry.spread, Boolean(covers)) : []),
    [pages, partCounts, geometry, covers]
  );

  // Keep the reader on the same authored page when the layout changes.
  const currentSheetIndex = useMemo(() => {
    if (sheets.length === 0) return 0;
    const exact = sheets.findIndex((sheet) =>
      sheet.kind === "page"
        ? sheet.pageIndex === position.pageIndex && sheet.part === Math.min(position.part, sheet.parts - 1)
        : sheet.kind === "cover" && (sheet.side === "front" ? position.pageIndex < 0 : position.pageIndex >= pages.length)
    );
    return exact === -1 ? 0 : exact;
  }, [sheets, position, pages.length]);

  const perView = geometry?.spread ? 2 : 1;
  const viewStart = Math.floor(currentSheetIndex / perView) * perView;
  const visible = sheets.slice(viewStart, viewStart + perView);
  // A spread showing one cover alone: the cover casts its own shadow, not the empty space beside it.
  const closedBook = visible.some((sheet) => sheet.kind === "none");
  const canGoBack = viewStart > 0;
  const canGoForward = viewStart + perView < sheets.length;

  const goTo = useCallback(
    (sheetIndex: number) => {
      const clamped = Math.max(0, Math.min(sheets.length - 1, sheetIndex));
      // A blank filler (or the space beside a cover) has no page of its own; land on its neighbour.
      const landable = (sheet: Sheet | undefined) => sheet?.kind === "page" || sheet?.kind === "cover";
      const target = [sheets[clamped], sheets[clamped + 1], sheets[clamped - 1]].find(landable);
      if (target?.kind === "page") setPosition({ pageIndex: target.pageIndex, part: target.part });
      else if (target?.kind === "cover") setPosition({ pageIndex: target.side === "front" ? FRONT_COVER : pages.length, part: 0 });
    },
    [sheets, pages.length]
  );

  // Back cover: "Start from the beginning" opens page 1 and keeps the keyboard in the reader.
  const startAgain = () => {
    goTo(sheets.findIndex((sheet) => sheet.kind === "page"));
    sectionRef.current?.focus();
  };

  const animate = pageTurn && !reducedMotion;
  const turnMs = geometry?.spread ? TURN_MS_SPREAD : TURN_MS_SINGLE;
  const turnTo = (start: number, direction: Turn["direction"]) => {
    if (animate) {
      const pad = (list: Sheet[]) => (perView === 2 && list.length === 1 ? [...list, { kind: "none" } as Sheet] : list);
      turnCount.current += 1;
      setTurn({ id: turnCount.current, direction, from: pad(visible), to: pad(sheets.slice(start, start + perView)) });
    }
    goTo(start);
  };
  const next = () => canGoForward && turnTo(viewStart + perView, "forward");
  const previous = () => canGoBack && turnTo(viewStart - perView, "back");
  // A turn in progress ends with its animation; this is a backstop (e.g. a hidden tab skips animations).
  useEffect(() => {
    if (!turn) return;
    const timer = window.setTimeout(() => setTurn(null), turnMs + 200);
    return () => window.clearTimeout(timer);
  }, [turn, turnMs]);
  useEffect(() => setTurn(null), [layoutId, animate]);

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
      const sources =
        sheet.kind === "page"
          ? pageMediaIds(pages[sheet.pageIndex]).map((id) => media[id]?.src)
          : sheet.kind === "cover"
            ? [(sheet.side === "front" ? covers?.front : covers?.back)?.src]
            : [];
      for (const src of sources) {
        if (!src || preloaded.current.has(src)) continue;
        preloaded.current.add(src);
        const image = new Image();
        image.decoding = "async";
        image.src = src;
      }
    }
  }, [sheets, viewStart, perView, pages, media, covers]);

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
      tooLong: pages.map((_, index) => Boolean(fitList?.[index]?.gaveUp || fitList?.[index]?.scroll)),
    });
  }, [complete, totalPages, onLayout, pages, sizeFor, fitList]);
  const shortStatus = status.replace(/^Pages? /, "");
  // Sized from the reader's own width (not the screen), so previews match real devices.
  const compact = (stageSize?.width ?? COMPACT_BELOW) < COMPACT_BELOW;
  const wide = (stageSize?.width ?? 0) >= SPREAD_MIN_WIDTH;
  // Previous/Next beside the page and the page status in the bar (laptops, desktops, sideways phones).
  const sideNav = wide || sideways;
  const phone = Boolean(homeHref) && (compact || sideways);

  const sheetStyle = geometry
    ? ({
        width: geometry.sheetWidth,
        height: geometry.sheetHeight,
        fontSize: textSize,
        // Pictures take at most ~60% of the page height, so they can share a page with their text.
        "--book-picture-max": `${Math.max(120, Math.round(geometry.contentHeight * PICTURE_SHARE))}px`,
        // The usual limit before any per-page fitting; tap pictures never shrink below it on small pages.
        "--book-picture-share": `${Math.max(120, Math.round(geometry.contentHeight * PICTURE_SHARE))}px`,
        // Laptops and desktops (mouse or trackpad): answers and question buttons are 48px high, not 56.
        // Touch screens keep the full-size answers and tap pictures in a spread too. Wide single pages
        // (tablets in landscape) cap answer pictures like a spread; with a mouse, wide always means spread.
        ...(geometry.wide
          ? {
              "--book-option-picture-max": `${Math.round(geometry.contentHeight * OPTION_PICTURE_SHARE)}px`,
              ...(geometry.touch ? {} : { "--answer-min-h": "48px", "--answer-min-em": "3em", "--tap-picture-min": "200px" }),
            }
          : {}),
      } as CSSProperties)
    : undefined;

  function endSwipe(event: PointerEvent<HTMLDivElement>, finished: boolean) {
    if (event.pointerType === "mouse") return;
    const start = swipe.current;
    if (!start || start.id !== event.pointerId) return;
    swipe.current = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // Pinch-zoomed in: sideways moves pan the page instead.
    const zoomed = (window.visualViewport?.scale ?? 1) > 1.01;
    if (!finished || zoomed || Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5 || event.timeStamp - start.t > SWIPE_MAX_MS) return;
    swipedAt.current = event.timeStamp;
    if (dx < 0) next();
    else previous();
  }

  const turnHasNone = Boolean(turn && [...turn.from, ...turn.to].some((sheet) => sheet.kind === "none"));

  // One sheet of the book. `still` copies (in a turning page) fill the empty space beside a cover, so
  // the live view underneath never shows through.
  function drawSheet(sheet: Sheet, slot: string, side: "left" | "right" | "single", still = false): ReactNode {
    if (!geometry) return null;
    if (sheet.kind === "cover" && covers) {
      return <CoverSheet key={`cover-${sheet.side}`} side={sheet.side} covers={covers} style={sheetStyle} spread={geometry.spread} onStart={startAgain} />;
    }
    if (sheet.kind === "none" || sheet.kind === "cover") {
      return <div key={`none-${slot}`} aria-hidden="true" className={`shrink-0 ${still ? "bg-slate-100" : ""}`} style={{ width: geometry.sheetWidth, height: geometry.sheetHeight }} />;
    }
    const page = sheet.kind === "page" ? sheet.pageIndex : null;
    return (
      <SheetView
        key={page !== null && sheet.kind === "page" ? `${page}-${sheet.part}` : `blank-${slot}`}
        sheet={sheet}
        pages={pages}
        media={media}
        geometry={geometry}
        questions={questions}
        pictureCap={page !== null ? capFor(page) : null}
        optionCap={page !== null ? optionCapFor(page) : null}
        compact={page !== null && Boolean(fitList?.[page]?.compact)}
        scroll={page !== null && Boolean(fitList?.[page]?.scroll)}
        pageSize={page !== null ? sizeFor(page) : textSize}
        textSize={textSize}
        style={sheetStyle}
        side={side}
      />
    );
  }

  // The turning page: in a spread it hinges on the spine and shows the next page on its back; a single
  // page folds away from its left edge (or folds back in when going back).
  function drawTurn(current: Turn, shape: Geometry): ReactNode {
    const forward = current.direction === "forward";
    const { from, to } = current;
    const width = shape.sheetWidth;
    const base = shape.spread ? (forward ? [from[0], to[1]] : [to[0], from[1]]) : [forward ? to[0] : from[0]];
    const front = shape.spread ? (forward ? from[1] : from[0]) : forward ? from[0] : to[0];
    const back = shape.spread ? (forward ? to[0] : to[1]) : null;
    const leafClass = shape.spread ? (forward ? "book-leaf-forward" : "book-leaf-back") : forward ? "book-leaf-away" : "book-leaf-return";
    const hingeRight = shape.spread && !forward;
    const face = "absolute inset-0 overflow-hidden [backface-visibility:hidden]";
    const shade = (
      <div
        aria-hidden="true"
        className={`book-shade pointer-events-none absolute inset-0 opacity-0 ${hingeRight ? "bg-gradient-to-l" : "bg-gradient-to-r"} from-black/20 via-black/5 to-transparent`}
      />
    );
    return (
      <div
        key={current.id}
        aria-hidden="true"
        inert
        data-turn={current.direction}
        className="pointer-events-none absolute inset-0 flex"
        style={{ perspective: `${Math.round(width * 4.5)}px`, "--book-turn-ms": `${turnMs}ms` } as CSSProperties}
      >
        {base.map((sheet, index) =>
          sheet ? drawSheet(sheet, `turn-base-${index}`, shape.spread ? (index === 0 ? "left" : "right") : "single", true) : null
        )}
        {front && (
          <div
            data-turn-leaf=""
            className={`book-leaf ${leafClass} absolute top-0`}
            style={{
              left: shape.spread && forward ? width : 0,
              width,
              height: shape.sheetHeight,
              transformOrigin: hingeRight ? "right center" : "left center",
              transformStyle: "preserve-3d",
              ...(forward || shape.spread ? {} : { transform: "rotateY(-100deg)" }),
            }}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget) setTurn((active) => (active?.id === current.id ? null : active));
            }}
          >
            <div className={face}>
              {drawSheet(front, "turn-front", shape.spread ? (forward ? "right" : "left") : "single", true)}
              {shade}
            </div>
            {back && (
              <div className={face} style={{ transform: "rotateY(180deg)" }}>
                {drawSheet(back, "turn-back", forward ? "left" : "right", true)}
                {shade}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <ReaderLabelsContext.Provider value={showLabels}>
    <section
      ref={sectionRef}
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      // Tells the page's CSS to hide the candidate header on phones (see app/globals.css).
      data-reader-owns-header={homeHref ? "" : undefined}
      className="flex h-full min-h-0 flex-col bg-slate-100 text-ink outline-none"
    >
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
          dense={sideNav}
          narrow={(stageSize?.width ?? 0) < ROOMY_BAR}
          stacked={!sideNav && !compact && (stageSize?.width ?? 0) < STACKED_BAR_BELOW}
          status={sideNav ? status : undefined}
          centreStatus={!sideways}
          start={wide ? barStart : undefined}
          end={wide ? barEnd : undefined}
          home={phone ? homeHref : undefined}
          textSizeInBar={!compact && !sideways}
        />
      )}
      <div
        ref={stageRef}
        // Pictures aren't dragged out of the book, so a swipe that starts on one still turns the page.
        className="relative min-h-0 flex-1 overflow-hidden [&_img]:[-webkit-user-drag:none]"
        // Sideways swipes are the reader's; up/down scrolling and pinch zoom stay the browser's.
        style={touch ? { touchAction: "pan-y pinch-zoom" } : undefined}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          // A second finger (pinch zoom) is never the first pointer; it cancels the swipe.
          const target = event.target as Element;
          swipe.current =
            event.isPrimary && !panel && !target.closest("[data-no-swipe], input, textarea")
              ? { id: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp }
              : null;
        }}
        onPointerUp={(event) => endSwipe(event, true)}
        onPointerCancel={(event) => endSwipe(event, false)}
        // A swipe that started on an answer mustn't also choose it.
        onClickCapture={(event) => {
          if (event.timeStamp - swipedAt.current < 500) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
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
        {tools && panel === "settings" && (
          <SettingsPanel
            textSize={textSize}
            onTextSizeChange={onTextSizeChange}
            showLabels={showLabels}
            onToggleLabels={toggleLabels}
            pageTurn={pageTurn}
            onTogglePageTurn={togglePageTurn}
            reducedMotion={reducedMotion}
            links={
              phone && homeHref ? (
                <>
                  <Link href={homeHref} className={PANEL_LINK}>
                    Back to home
                  </Link>
                  {accountLinks}
                </>
              ) : undefined
            }
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
                const probe = page.question && !fitList?.[index]?.final;
                return [
                  <FlowColumns
                    key={page.id}
                    pageIndex={index}
                    page={page}
                    media={media}
                    geometry={geometry}
                    questions={questions}
                    pictureCap={capFor(index)}
                    optionCap={optionCapFor(index)}
                    compact={fitList?.[index]?.compact}
                    scroll={fitList?.[index]?.scroll}
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
                      pictureCap={capFor(index)}
                      optionCap={optionCapFor(index)}
                      compact={fitList?.[index]?.compact}
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
                  const states = !fitList?.[index]?.gaveUp ? (["answering", "checked", "full"] as const) : (["answering", "checked"] as const);
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
              <div className="flex h-full items-center justify-center gap-4" style={{ padding: geometry.wide ? SPREAD_PADDING : STAGE_PADDING }}>
                {geometry.wide && <SideButton direction="previous" disabled={!canGoBack} onClick={previous} />}
                <div className={`relative flex ${closedBook || turnHasNone ? "" : geometry.wide ? "shadow-xl" : "shadow-md"}`}>
                  {visible.map((sheet, index) =>
                    drawSheet(sheet, `${viewStart + index}`, geometry.spread ? (index === 0 ? "left" : "right") : "single")
                  )}
                  {geometry.spread && visible.length === 1 && <div aria-hidden="true" style={{ width: geometry.sheetWidth }} />}
                  {turn && drawTurn(turn, geometry)}
                </div>
                {geometry.wide && <SideButton direction="next" disabled={!canGoForward} onClick={next} />}
              </div>
            )}
          </>
        )}
      </div>

      {sideNav ? (
        // Laptops and desktops: Previous/Next sit beside the pages and the page status is in the bar.
        <p className="sr-only" aria-live="polite">
          {status}
        </p>
      ) : (
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
      )}
    </section>
    </ReaderLabelsContext.Provider>
  );
}

function subscribeSideways(onChange: () => void) {
  const query = window.matchMedia(PHONE_SIDEWAYS_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// Laptops and desktops: a tall Previous/Next button beside the spread.
function SideButton({ direction, disabled, onClick }: { direction: "previous" | "next"; disabled: boolean; onClick: () => void }) {
  const isNext = direction === "next";
  const showLabels = useContext(ReaderLabelsContext);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={showLabels ? undefined : isNext ? "Next page" : "Previous page"}
      className={`flex h-36 w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40 ${
        isNext ? "bg-primary text-white hover:bg-primary/90" : "border-2 border-ink/25 bg-white text-ink hover:bg-slate-50"
      }`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={isNext ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"} />
      </svg>
      <span className={showLabels ? undefined : "sr-only"}>{isNext ? "Next" : "Previous"}</span>
    </button>
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
  const showLabels = useContext(ReaderLabelsContext);
  const iconOnly = compact || !showLabels;
  const tone = isNext
    ? "bg-primary text-white hover:bg-primary/90"
    : "border-2 border-ink/25 bg-white text-ink hover:bg-slate-50";
  const size = iconOnly ? "size-14" : "h-14 min-w-36 gap-2 px-5";
  const arrow = (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={iconOnly ? "size-7" : "size-5"} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={isNext ? "M9 5l7 7-7 7" : "M15 5l-7 7 7 7"} />
    </svg>
  );
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={iconOnly ? (isNext ? "Next page" : "Previous page") : undefined}
      title={iconOnly && !compact ? (isNext ? "Next page" : "Previous page") : undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-xl text-lg font-semibold transition-colors focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40 ${tone} ${size}`}
    >
      {!isNext && arrow}
      {!iconOnly && (isNext ? "Next" : "Previous")}
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
  optionCap = null,
  compact = false,
  scroll = false,
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
  optionCap?: number | null;
  // Fitting: tighter spacing in a question; or, when it can't fit at all, one tall column that scrolls.
  compact?: boolean;
  scroll?: boolean;
  offset?: number;
}) {
  const key = questionKey(page);
  const pageStyle = {
    ...(page.question ? { position: "relative" } : {}),
    ...(pictureCap ? { "--book-picture-max": `${pictureCap}px` } : {}),
    ...(optionCap ? { "--book-option-picture-max": `${optionCap}px` } : {}),
    ...(compact ? { "--q-space": COMPACT_SPACE } : {}),
  } as CSSProperties;
  return (
    <div
      className="leading-[1.6]"
      data-page-index={pageIndex}
      data-fit-index={fitIndex}
      style={{
        ...(fontSize && fontSize !== baseSize ? { fontSize } : {}),
        width: geometry.contentWidth,
        ...(scroll
          ? {}
          : {
              height: geometry.contentHeight,
              columnWidth: geometry.contentWidth,
              columnGap: geometry.columnGap,
              columnFill: "auto" as const,
              transform: offset ? `translateX(-${offset * (geometry.contentWidth + geometry.columnGap)}px)` : undefined,
            }),
        ...pageStyle,
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
  pictureCap,
  optionCap,
  compact,
  scroll,
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
  pictureCap: number | null;
  optionCap: number | null;
  compact: boolean;
  scroll: boolean;
  pageSize: number;
  textSize: number;
  style?: CSSProperties;
  side: "left" | "right" | "single";
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  // Scrolling question pages: whether there is more below what shows, for the "More below" cue.
  const [moreBelow, setMoreBelow] = useState(false);
  const checkMore = useCallback(() => {
    const box = boxRef.current;
    setMoreBelow(Boolean(scroll && box && box.scrollHeight - box.scrollTop - box.clientHeight > 4));
  }, [scroll]);
  useLayoutEffect(checkMore);
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

  if (sheet.kind !== "page") {
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

      <div className="relative" style={{ marginLeft: geometry.padX, marginTop: geometry.contentTop }}>
        <div
          ref={boxRef}
          // A scrolling box starts its own touch rules: sideways swipes stay the reader's here too.
          className={
            scroll
              ? "touch-pan-y touch-pinch-zoom overflow-x-hidden overflow-y-auto overscroll-contain focus-visible:outline-3 focus-visible:outline-primary"
              : "overflow-hidden"
          }
          // Nothing may scroll a sheet sideways (e.g. find-in-page); that would show the wrong part.
          // Only a question too long for any page scrolls, and only downwards.
          onScroll={(event) => {
            event.currentTarget.scrollLeft = 0;
            if (!scroll) event.currentTarget.scrollTop = 0;
            checkMore();
          }}
          tabIndex={scroll ? 0 : undefined}
          aria-label={scroll ? "Question. Scroll down to see all of it." : undefined}
          role={scroll ? "region" : undefined}
          aria-hidden={repeat || undefined}
          // Repeats are also out of reach of the keyboard (a question's buttons, for example).
          inert={repeat || undefined}
          style={{ width: geometry.contentWidth, height: geometry.contentHeight }}
        >
          <FlowColumns
            page={page}
            media={media}
            geometry={geometry}
            questions={questions}
            pictureCap={pictureCap}
            optionCap={optionCap}
            compact={compact}
            scroll={scroll}
            offset={sheet.part}
            fontSize={pageSize}
            baseSize={textSize}
          />
        </div>
        {moreBelow && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[4em] items-end justify-center bg-gradient-to-t from-white via-white/90 to-transparent">
            <button
              type="button"
              className="pointer-events-auto mb-[0.2em] inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-primary bg-white px-4 text-[0.9em] font-semibold text-primary shadow-sm hover:bg-primary/[0.06] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
              onClick={() =>
                boxRef.current?.scrollBy({
                  top: Math.round(geometry.contentHeight * 0.7),
                  behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                })
              }
            >
              More below
              <svg viewBox="0 0 20 20" aria-hidden="true" className="size-[1em]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 8l5 5 5-5" />
              </svg>
            </button>
          </div>
        )}
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

// Buttons on the back cover: the reader's large targets (56px on touch screens, 48px on laptops).
const COVER_BUTTON =
  "inline-flex min-h-[max(var(--answer-min-h,56px),var(--answer-min-em,3.5em))] items-center justify-center rounded-xl px-[1.2em] text-[1em] font-semibold transition-colors focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-primary";

function CoverSheet({
  side,
  covers,
  style,
  spread,
  onStart,
}: {
  side: "front" | "back";
  covers: BookCovers;
  style?: CSSProperties;
  spread: boolean;
  onStart: () => void;
}) {
  // In a spread the book's spine is on the cover's inner edge; only the outer corners are rounded.
  const shape = spread ? `shadow-xl ${side === "front" ? "rounded-r-md" : "rounded-l-md"}` : "rounded-sm";
  const picture = side === "front" ? covers.front : covers.back;
  return (
    <article aria-label={side === "front" ? "Front cover" : "Back cover"} className={`relative shrink-0 overflow-hidden ${shape}`} style={style}>
      {side === "front" ? (
        <FrontCoverFace categoryName={covers.categoryName} picture={picture} />
      ) : (
        <BackCoverFace
          categoryName={covers.categoryName}
          picture={picture}
          actions={
            <>
              {covers.homeHref && (
                <Link href={covers.homeHref} className={`${COVER_BUTTON} bg-primary text-white hover:bg-primary/90`}>
                  Back to home
                </Link>
              )}
              <button type="button" onClick={onStart} className={`${COVER_BUTTON} border-2 border-ink/25 bg-white text-ink hover:bg-slate-50`}>
                Start from the beginning
              </button>
            </>
          }
        />
      )}
    </article>
  );
}

function describeView(visible: Sheet[], total: number, exact: boolean) {
  const numbers = visible.flatMap((sheet) => (sheet.kind === "page" ? [sheet.number] : []));
  const cover = visible.find((sheet) => sheet.kind === "cover");
  if (numbers.length === 0 && cover?.kind === "cover") return cover.side === "front" ? "Front cover" : "Back cover";
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

type Fit = { size: number; smallPictures: boolean; compact: boolean; gaveUp: boolean; scroll: boolean; final: boolean };

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
