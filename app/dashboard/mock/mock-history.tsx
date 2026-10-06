import Link from "next/link";
import { formatUkDate, formatUkTime } from "@/lib/candidates/access";
import { formatDuration } from "@/lib/format";
import { READINESS_TARGET, scorePercent, type MockEnd, type MockHistory, type MockHistoryEntry } from "@/lib/mock/types";
import { SECONDARY_BUTTON } from "@/components/candidate/buttons";

// How a test ended, where it wasn't simply submitted.
const ENDED: Partial<Record<MockEnd, string>> = {
  time_up: "Time ran out",
  away: "Time ran out while away",
  moved: "Ended when your category changed",
};

const score = (entry: MockHistoryEntry) => `${entry.rightCount} of ${entry.outOf} (${scorePercent(entry.rightCount, entry.outOf)}%)`;

// The candidate's past mock tests in this category, newest first; each opens its results.
export function MockHistoryList({
  history,
  moreHref,
  moreLabel = "Show more",
  showAverage = false,
  title = "Your mock tests",
  level = 2,
}: {
  history: MockHistory;
  moreHref: string | null;
  moreLabel?: string;
  showAverage?: boolean;
  title?: string;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  const last = history.items[0];
  const tiles: [string, string][] = [
    ["Last score", last ? score(last) : "–"],
    ...(showAverage ? [["Average score", history.averagePercent === null ? "–" : `${history.averagePercent}%`] as [string, string]] : []),
    ["Best score", history.best ? score(history.best) : "–"],
  ];
  return (
    <section aria-labelledby="history-heading" className={level === 2 ? "mt-10" : "mt-4"}>
      <Heading id="history-heading" className={level === 2 ? "text-2xl font-bold text-ink" : "text-xl font-bold text-ink"}>
        {title}
      </Heading>
      <dl className={`mt-4 grid gap-3 ${showAverage ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl border-2 border-ink/15 bg-white p-4">
            <dt className="text-base text-ink/80">{label}</dt>
            <dd className="text-2xl font-bold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-4 flex flex-col gap-3">
        {history.items.map((entry) => {
          const reached = entry.outOf > 0 && entry.rightCount / entry.outOf >= READINESS_TARGET;
          return (
            <li key={entry.id}>
              <Link
                href={`/dashboard/mock/${entry.id}`}
                className="flex min-h-16 items-center gap-3 rounded-xl border-2 border-ink/20 bg-white px-4 py-3 hover:border-primary hover:bg-primary/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold text-ink">
                    {formatUkDate(entry.endedAt, "long")} at {formatUkTime(entry.endedAt)}
                  </span>
                  <span className="block text-base text-ink/80">
                    {[ENDED[entry.how], `Time taken: ${formatDuration(entry.secondsTaken)}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end text-right">
                  <span className="text-lg font-bold text-ink">{score(entry)}</span>
                  {reached && <span className="text-sm font-semibold text-green-900">Readiness target reached</span>}
                </span>
                <span aria-hidden="true" className="text-3xl leading-none text-primary">
                  ›
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-base text-ink/80">
        Showing {history.items.length} of {history.count}
      </p>
      {moreHref && (
        <Link href={moreHref} className={`${SECONDARY_BUTTON} mt-3 w-full sm:w-auto`}>
          {moreLabel}
        </Link>
      )}
    </section>
  );
}
