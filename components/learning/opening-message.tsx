// Shown the moment Prepare is tapped (app/dashboard/prepare/loading.tsx) and while the reader lays out
// the first pages, so the screen is never blank.
export function OpeningMessage() {
  return (
    <div role="status" className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-5 bg-slate-100 p-6 text-center">
      <svg
        viewBox="0 0 48 48"
        aria-hidden="true"
        className="size-16 text-primary motion-safe:animate-pulse"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M24 12c-4-3-10-4-16-3v27c6-1 12 0 16 3 4-3 10-4 16-3V9c-6-1-12 0-16 3z" />
        <path d="M24 12v27" />
      </svg>
      <p className="text-xl font-semibold text-ink">Opening your Handbook…</p>
    </div>
  );
}
