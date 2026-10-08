// Results by chapter with a bar each, shared by the Practice report and mock test results.
export type ChapterResult = { key: string; label: string; right: number; outOf: number; badge?: string; badgeTone?: "amber" | "green" };

const BADGE_TONES = { amber: "border-amber-600 bg-amber-50 text-amber-950", green: "border-green-700 bg-green-50 text-green-900" };

// `noun` ends each count: "3 of 7 right", "5 of 9 done".
export function ChapterResults({
  id,
  title,
  items,
  showPercent = false,
  noun = "right",
  empty,
  level = 2,
}: {
  id: string;
  title: string;
  items: ChapterResult[];
  showPercent?: boolean;
  noun?: string;
  // Shown instead of the count when a chapter has nothing yet (e.g. "Not practised yet").
  empty?: string;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={id} className={level === 2 ? "mt-10" : "mt-6"}>
      <Heading id={id} className={level === 2 ? "text-2xl font-bold text-ink" : "text-xl font-bold text-ink"}>
        {title}
      </Heading>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.key} className="rounded-xl border-2 border-ink/15 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="min-w-0 text-lg font-semibold text-ink [overflow-wrap:anywhere]">
                {item.label}
                {item.badge && (
                  <span className={`ml-2 inline-block rounded-full border-2 px-2 align-middle text-sm font-semibold ${BADGE_TONES[item.badgeTone ?? "amber"]}`}>
                    {item.badge}
                  </span>
                )}
              </span>
              <span className="text-lg text-ink">
                {item.outOf === 0 && empty ? (
                  empty
                ) : (
                  <>
                    {item.right} of {item.outOf} {noun}
                    {showPercent && item.outOf > 0 && ` (${Math.round((item.right / item.outOf) * 100)}%)`}
                  </>
                )}
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
