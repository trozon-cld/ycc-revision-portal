// Results by chapter with a bar each, shared by the Practice report and mock test results.
export type ChapterResult = { key: string; label: string; right: number; outOf: number; badge?: string };

export function ChapterResults({ id, title, items, showPercent = false }: { id: string; title: string; items: ChapterResult[]; showPercent?: boolean }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="text-2xl font-bold text-ink">
        {title}
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.key} className="rounded-xl border-2 border-ink/15 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="min-w-0 text-lg font-semibold text-ink [overflow-wrap:anywhere]">
                {item.label}
                {item.badge && (
                  <span className="ml-2 inline-block rounded-full border-2 border-amber-600 bg-amber-50 px-2 align-middle text-sm font-semibold text-amber-950">
                    {item.badge}
                  </span>
                )}
              </span>
              <span className="text-lg text-ink">
                {item.right} of {item.outOf} right
                {showPercent && item.outOf > 0 && ` (${Math.round((item.right / item.outOf) * 100)}%)`}
              </span>
            </div>
            <div aria-hidden="true" className="mt-2 h-3 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full rounded-full bg-primary" style={{ width: `${item.outOf > 0 ? (item.right / item.outOf) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
