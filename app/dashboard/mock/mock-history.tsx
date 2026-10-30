import Link from "next/link";
import { formatUkDate, formatUkTime } from "@/lib/candidates/access";
import { formatDuration } from "@/lib/format";
import { READINESS_TARGET, scorePercent, scoreText, type MockEnd, type MockHistory, type MockHistoryEntry } from "@/lib/mock/types";
import { CARD, SECONDARY_BUTTON, SECTION_TITLE } from "@/components/candidate/buttons";
import { Accordion } from "@/components/candidate/accordion";

// How a test ended, where it wasn't simply submitted.
const ENDED: Partial<Record<MockEnd, string>> = {
  time_up: "Time ran out",
  away: "Time ran out while away",
  moved: "Ended when your test type changed",
};

const score = (entry: MockHistoryEntry) => scoreText(entry.rightCount, entry.outOf);

// The candidate's past mock tests in this test type, newest first; each opens its results.
export function MockHistoryList({
  history,
  moreHref,
  moreLabel = "Show more",
  showAverage = false,
  title = "Your mock tests",
  level = 2,
  collapse,
  open = false,
}: {
  history: MockHistory;
  moreHref: string | null;
  moreLabel?: string;
  showAverage?: boolean;
  title?: string;
  level?: 2 | 3;
  // "list": the score cards stay, the tests go in a closed accordion below them; "all": everything in one accordion.
  collapse?: "list" | "all";
  open?: boolean;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  const last = history.items[0];
  const tiles: [string, string][] = [
    ["Last score", last ? score(last) : "–"],
    ...(showAverage ? [["Average score", history.averagePercent === null ? "–" : `${history.averagePercent}%`] as [string, string]] : []),
    ["Best score", history.best ? score(history.best) : "–"],
  ];
  const cards = (
    <dl className={`mt-4 grid gap-3 ${showAverage ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {tiles.map(([label, value]) => (
        <div key={label} className={`${CARD} p-4`}>
          <dt className="text-base text-muted">{label}</dt>
          <dd className={SECTION_TITLE}>{value}</dd>
        </div>
      ))}
    </dl>
  );
  const tests = (
    <>
      <ul className="mt-4 flex flex-col gap-3">
        {history.items.map((entry) => {
          const reached = entry.outOf > 0 && entry.rightCount / entry.outOf >= READINESS_TARGET;
          return (
            <li key={entry.id}>
              <Link
                href={`/dashboard/mock/${entry.id}`}
                className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-line bg-card px-4 py-3 hover:border-primary hover:bg-primary/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {/* Phones: the score sits under the date, so neither is squeezed. */}
                <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-ink">
                      {formatUkDate(entry.endedAt, "long")} at {formatUkTime(entry.endedAt)}
                    </span>
                    <span className="block text-base text-muted">
                      {[ENDED[entry.how], `Time taken: ${formatDuration(entry.secondsTaken)}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex flex-col sm:shrink-0 sm:items-end sm:text-right">
                    <span className="text-base font-bold text-ink">{score(entry)}</span>
                    {reached && <span className="text-sm font-semibold text-ok-strong">Readiness target reached</span>}
                  </span>
                </span>
                <span aria-hidden="true" className="text-3xl leading-none text-primary">
                  ›
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-base text-muted">
        Showing {history.items.length} of {history.count}
      </p>
      {moreHref && (
        <Link href={moreHref} className={`${SECONDARY_BUTTON} mt-3 w-full sm:w-auto`}>
          {moreLabel}
        </Link>
      )}
    </>
  );
  if (collapse === "all") {
    return (
      <div className="mt-5 lg:mt-8">
        <Accordion id="history-heading" title={title} summary={[last && `Last ${scorePercent(last.rightCount, last.outOf)}%`, history.best && `Best ${scorePercent(history.best.rightCount, history.best.outOf)}%`].filter(Boolean).join(" · ")} open={open}>
          {cards}
          {tests}
        </Accordion>
      </div>
    );
  }
  if (collapse === "list") {
    return (
      <div className="mt-4">
        {cards}
        <div className="mt-4">
          <Accordion id="history-heading" title={title} summary={`Showing ${history.items.length} of ${history.count}`} open={open} nested>
            {tests}
          </Accordion>
        </div>
      </div>
    );
  }
  return (
    <section aria-labelledby="history-heading" className={level === 2 ? "mt-5 lg:mt-8" : "mt-4"}>
      <Heading id="history-heading" className={level === 2 ? SECTION_TITLE : "text-xl font-bold text-ink"}>
        {title}
      </Heading>
      {cards}
      {tests}
    </section>
  );
}
