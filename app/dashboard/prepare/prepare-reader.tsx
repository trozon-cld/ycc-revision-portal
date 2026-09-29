"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BookPageData, ResolvedMedia, TextSize } from "@/lib/content/book";
import type { BookCovers } from "@/lib/content/covers";
import { BookReader } from "@/components/learning/book-reader";
import { BAR_BUTTON_DENSE, barButton } from "@/components/learning/reader-tools";
import { AccountLinks, HomeLogo } from "@/components/candidate/header";
import { saveReadingPosition, saveTextSize } from "./actions";

// Saves only once the candidate settles, so quick page turns don't queue up requests.
const POSITION_DELAY = 1500;
const TEXT_SIZE_DELAY = 800;

function useDebounced<T>(save: (value: T) => Promise<void>, delay: number) {
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<{ value: T } | null>(null);
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (next) save(next.value).catch(() => {});
  }, [save]);
  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, delay);
    },
    [flush, delay]
  );
  // Leaving the page (e.g. Home) still saves the last change.
  useEffect(() => flush, [flush]);
  return schedule;
}

export function PrepareReader({
  pages,
  media,
  startPageId,
  initialTextSize,
  covers,
}: {
  pages: BookPageData[];
  media: ResolvedMedia;
  startPageId: string | null;
  initialTextSize: TextSize;
  covers: BookCovers;
}) {
  const [textSize, setTextSize] = useState<TextSize>(initialTextSize);
  const savePosition = useDebounced(saveReadingPosition, POSITION_DELAY);
  const saveSize = useDebounced(saveTextSize, TEXT_SIZE_DELAY);

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
      resultsNote="These results are for this visit only."
      barStart={<HomeLogo showName={false} />}
      barEnd={<AccountLinks buttonClass={`${barButton} ${BAR_BUTTON_DENSE}`} />}
    />
  );
}
