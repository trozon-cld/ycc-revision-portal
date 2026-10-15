// Shown under the header while Home, Change category, Help or My progress opens (app/dashboard/loading.tsx).
export function PageLoading() {
  return (
    <div role="status" className="candidate-loading flex flex-1 flex-col items-center justify-center gap-4 bg-page p-6 text-center">
      <span aria-hidden="true" className="size-12 rounded-full border-4 border-primary/20 border-t-primary motion-safe:animate-spin" />
      <p className="text-xl font-semibold text-ink">Opening…</p>
    </div>
  );
}
