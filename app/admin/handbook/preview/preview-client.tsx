"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { BookPageData, ResolvedMedia } from "@/lib/content/book";
import type { BookCovers } from "@/lib/content/covers";
import { BookPreview } from "@/components/admin/book-preview";
import { cardClass } from "@/components/admin/styles";
import { Spinner } from "@/components/spinner";
import { formatCount } from "@/lib/format";

// With the reader covered nobody is reading, so the rest of the book is counted in bigger steps than for candidates.
const PREVIEW_BATCH = 40;

const ApplyingContext = createContext<(applying: boolean) => void>(() => {});

// Placed inside the filter bar's form: tells the preview while Apply is loading.
export function ApplyingReporter() {
  const { pending } = useFormStatus();
  const report = useContext(ApplyingContext);
  useEffect(() => report(pending), [pending, report]);
  return null;
}

// While Apply loads or the reader counts pages, the filters are greyed out and a progress card covers the reader.
export function PreviewWorkspace({
  filters,
  children,
  pages,
  media,
  covers,
}: {
  filters: ReactNode;
  children?: ReactNode;
  pages: BookPageData[];
  media: ResolvedMedia;
  covers?: BookCovers;
}) {
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [progressFor, setProgressFor] = useState(pages);
  if (progressFor !== pages) {
    setProgressFor(pages);
    setProgress(null);
  }
  const counting = !progress || progress.done < progress.total;
  const busy = applying || counting;
  const percent = progress && progress.total > 0 ? Math.floor((progress.done / progress.total) * 100) : 0;

  return (
    <>
      <ApplyingContext.Provider value={setApplying}>
        <div inert={busy} className={busy ? "opacity-60" : undefined}>
          {filters}
        </div>
      </ApplyingContext.Provider>
      {children}
      <div className="relative">
        <div inert={busy}>
          <BookPreview
            pages={pages}
            media={media}
            label="Book Preview"
            initialDevice="full"
            readerTools
            allowFullWindow
            covers={covers}
            backgroundBatch={PREVIEW_BATCH}
            onProgress={(done, total) => setProgress({ done, total })}
          />
        </div>
        {busy && (
          <div className="absolute inset-0 z-10 flex items-start justify-center rounded-lg bg-white/85 px-4 pt-16">
            <div role="status" className={`${cardClass} w-full max-w-sm space-y-3 p-5 shadow-sm`}>
              {applying ? (
                <p className="flex items-center gap-2 font-medium text-ink">
                  <Spinner />
                  Loading preview…
                </p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium text-ink">Preparing pages…</p>
                    <span className="text-sm tabular-nums text-slate-600">{percent}%</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Preparing pages"
                    aria-valuemin={0}
                    aria-valuemax={progress?.total ?? pages.length}
                    aria-valuenow={progress?.done ?? 0}
                    aria-valuetext={`${progress?.done ?? 0} of ${progress?.total ?? pages.length} items`}
                    className="h-3 overflow-hidden rounded-full bg-slate-200"
                  >
                    <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="text-sm text-slate-600">
                    {formatCount(progress?.done ?? 0)} of {formatCount(progress?.total ?? pages.length, "item")} laid out.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
