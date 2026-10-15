import { BADGE, BAR_FILL, BAR_TRACK, CARD } from "@/components/candidate/buttons";

// Results by chapter with a bar each, shared by the Practice report and mock test results.
export type ChapterResult = { key: string; label: string; right: number; outOf: number; badge?: string; badgeTone?: "amber" | "green" };

const BADGE_TONES = { amber: "border-warn bg-warn-bg text-warn-strong", green: "border-ok bg-ok-bg text-ok-strong" };

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
  // Inside another section (My progress) it's a plain part of it, so the page has no two landmarks named alike.
  const Wrapper = level === 2 ? "section" : "div";
  return (
    <Wrapper aria-labelledby={level === 2 ? id : undefined} className={level === 2 ? "mt-10" : "mt-6"}>
      <Heading id={id} className={level === 2 ? "text-2xl font-bold text-ink" : "text-xl font-bold text-ink"}>
        {title}
      </Heading>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.key} className={`${CARD} p-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="min-w-0 text-lg font-semibold text-ink [overflow-wrap:anywhere]">
                {item.label}
                {item.badge && (
                  <span className={`${BADGE} ml-2 align-middle ${BADGE_TONES[item.badgeTone ?? "amber"]}`}>
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
            <div aria-hidden="true" className={`${BAR_TRACK} mt-2 h-3.5`}>
              <div className={BAR_FILL} style={{ width: `${item.outOf > 0 ? (item.right / item.outOf) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Wrapper>
  );
}
