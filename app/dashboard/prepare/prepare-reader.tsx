"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BookPageData, HandbookOutcome, ResolvedMedia, TextSize } from "@/lib/content/book";
import type { BookCovers } from "@/lib/content/covers";
import { BookReader } from "@/components/learning/book-reader";
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
function usePagesDone(categoryId: string) {
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef(new Set<string>());
  const flushRef = useRef<() => void>(() => {});
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (pending.current.size === 0) return;
    // At most a batch per save; once one is saved, the next goes straight after.
    const ids = [...pending.current].slice(0, PAGES_DONE_BATCH);
    for (const id of ids) pending.current.delete(id);
    saveHandbookPagesDone(categoryId, ids).then(
      () => pending.current.size > 0 && flushRef.current(),
      // Not saved: back in the list, sent with the next batch (marking a page done twice changes nothing).
      () => ids.forEach((id) => pending.current.add(id))
    );
  }, [categoryId]);
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

export function PrepareReader({
  categoryId,
  pages,
  media,
  startPageId,
  initialTextSize,
  covers,
}: {
  // Every save names the category this book was opened for; the server ignores it after a switch.
  categoryId: string;
  pages: BookPageData[];
  media: ResolvedMedia;
  startPageId: string | null;
  initialTextSize: TextSize;
  covers: BookCovers;
}) {
  const [textSize, setTextSize] = useState<TextSize>(initialTextSize);
  const savePosition = useDebounced(useCallback((itemId: string) => saveReadingPosition(categoryId, itemId), [categoryId]), POSITION_DELAY);
  const saveSize = useDebounced(saveTextSize, TEXT_SIZE_DELAY);
  const pagesDone = usePagesDone(categoryId);
  const saveAnswer = useCallback(
    (pageId: string, outcome: HandbookOutcome) => {
      saveHandbookAnswer(categoryId, pageId, outcome).catch(() => {});
    },
    [categoryId]
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
    />
  );
}
