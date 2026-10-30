"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PICTURE_LINK_SECONDS, type BookPageData, type HandbookOutcome, type ResolvedMedia, type TextSize } from "@/lib/content/book";
import type { BookCovers } from "@/lib/content/covers";
import { BookReader } from "@/components/learning/book-reader";
import type { ListenSetup } from "@/components/learning/listen";
import { BAR_BUTTON_DENSE, PANEL_LINK, barButton } from "@/components/learning/reader-tools";
import { AccountLinks, HomeLogo } from "@/components/candidate/header";
import { saveHandbookAnswer, saveHandbookPagesDone, saveReadingPosition, saveTextSize } from "./actions";

// Saves only once the candidate settles, so quick page turns don't queue up requests.
const POSITION_DELAY = 1500;
const TEXT_SIZE_DELAY = 800;
const PAGES_DONE_DELAY = 2000;
// Well under the server's limit per save (lib/progress/handbook.ts).
const PAGES_DONE_BATCH = 40;

function useDebounced<T>(save: (value: T) => Promise<void>, delay: number) {
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<{ value: T } | null>(null);
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    // Not saved (e.g. no connection): kept, unless something newer came meanwhile, and sent with the next change.
    if (next)
      save(next.value).catch(() => {
        pending.current ??= next;
      });
  }, [save]);
  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, delay);
    },
    [flush, delay]
  );
  // Leaving the page (e.g. Home) still saves the last change; so does the connection coming back.
  useEffect(() => {
    window.addEventListener("online", flush);
    return () => {
      window.removeEventListener("online", flush);
      flush();
    };
  }, [flush]);
  return schedule;
}

// Pages seen are collected and sent together; leaving or hiding the page sends what's left.
function usePagesDone(testTypeId: string) {
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef(new Set<string>());
  const flushRef = useRef<() => void>(() => {});
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (pending.current.size === 0) return;
    // At most a batch per save; once one is saved, the next goes straight after.
    const ids = [...pending.current].slice(0, PAGES_DONE_BATCH);
    for (const id of ids) pending.current.delete(id);
    saveHandbookPagesDone(testTypeId, ids).then(
      () => pending.current.size > 0 && flushRef.current(),
      // Not saved: back in the list, sent with the next batch (marking a page done twice changes nothing).
      () => ids.forEach((id) => pending.current.add(id))
    );
  }, [testTypeId]);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => {
    const hidden = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("online", flush);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("online", flush);
      flush();
    };
  }, [flush]);
  return useCallback(
    (ids: string[]) => {
      for (const id of ids) pending.current.add(id);
      window.clearTimeout(timer.current);
      if (pending.current.size >= PAGES_DONE_BATCH) flush();
      else timer.current = window.setTimeout(flush, PAGES_DONE_DELAY);
    },
    [flush]
  );
}

// Picture links run out after PICTURE_LINK_SECONDS. In a long reading session, the first picture that fails
// near then makes the page fetch fresh links (at most once a minute); a broken picture earlier changes nothing.
const REFRESH_AFTER_MS = (PICTURE_LINK_SECONDS - 10 * 60) * 1000;
const REFRESH_GAP_MS = 60 * 1000;

function useFreshPictureLinks(media: ResolvedMedia) {
  const router = useRouter();
  const issued = useRef(0);
  const lastRefresh = useRef(0);
  useEffect(() => {
    issued.current = Date.now();
  }, [media]);
  useEffect(() => {
    const failed = (event: Event) => {
      if (!(event.target instanceof HTMLImageElement)) return;
      const now = Date.now();
      if (now - issued.current < REFRESH_AFTER_MS || now - lastRefresh.current < REFRESH_GAP_MS) return;
      lastRefresh.current = now;
      router.refresh();
    };
    // Picture load errors don't bubble, so they're caught on the way down.
    window.addEventListener("error", failed, true);
    return () => window.removeEventListener("error", failed, true);
  }, [router]);
}

export function PrepareReader({
  testTypeId,
  pages,
  media,
  startPageId,
  initialTextSize,
  covers,
  listen,
}: {
  // Every save names the test type this book was opened for; the server ignores it after a switch.
  testTypeId: string;
  pages: BookPageData[];
  media: ResolvedMedia;
  startPageId: string | null;
  initialTextSize: TextSize;
  covers: BookCovers;
  // null when Listen is off for the test type: no Listen button and no Reading speed.
  listen: { language: string; languageName: string; durations: Record<string, number> } | null;
}) {
  const languageName = listen?.languageName ?? null;
  const durations = listen?.durations ?? null;
  const listenSetup = useMemo<ListenSetup | undefined>(
    () =>
      languageName && durations
        ? { languageName, durations, src: (pageId) => `/api/handbook/audio/${pageId}`, accountHref: "/dashboard/account" }
        : undefined,
    [languageName, durations]
  );
  const [textSize, setTextSize] = useState<TextSize>(initialTextSize);
  useFreshPictureLinks(media);
  const savePosition = useDebounced(useCallback((itemId: string) => saveReadingPosition(testTypeId, itemId), [testTypeId]), POSITION_DELAY);
  const saveSize = useDebounced(saveTextSize, TEXT_SIZE_DELAY);
  const pagesDone = usePagesDone(testTypeId);
  const saveAnswer = useCallback(
    (pageId: string, outcome: HandbookOutcome) => {
      saveHandbookAnswer(testTypeId, pageId, outcome).catch(() => {});
    },
    [testTypeId]
  );

  return (
    <BookReader
      pages={pages}
      media={media}
      label="Handbook"
      tools
      textSize={textSize}
      onTextSizeChange={(size) => {
        setTextSize(size);
        saveSize(size);
      }}
      covers={covers}
      initialPageId={startPageId}
      onPageChange={savePosition}
      onPagesDone={pagesDone}
      onQuestionDone={saveAnswer}
      resultsNote="These results are for this visit only."
      barStart={<HomeLogo showName={false} />}
      barEnd={<AccountLinks buttonClass={`${barButton} ${BAR_BUTTON_DENSE}`} />}
      homeHref="/dashboard"
      accountLinks={<AccountLinks buttonClass={PANEL_LINK} />}
      listen={listenSetup}
    />
  );
}
