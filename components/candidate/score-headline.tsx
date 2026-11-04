import { BAR_FILL, BAR_TRACK } from "./buttons";

// "Your score", "48 of 50 right  96%" and its bar: the same at the top of Practice and mock test results.
// `fill` is the bar's share (0–1); with nothing answered there's no percentage or bar.
export function ScoreHeadline({ right, outOf, percent, fill }: { right: number; outOf: number; percent: number | null; fill: number }) {
  return (
    <>
      <h2 id="score-heading" className="text-base font-semibold text-muted">
        Your score
      </h2>
      <p className="mt-1 text-3xl font-bold text-ink">
        {right} of {outOf} right
        {percent !== null && <span className="ml-2 text-2xl font-semibold text-muted">{percent}%</span>}
      </p>
      {percent !== null && (
        <div aria-hidden="true" className={`${BAR_TRACK} mt-4 h-4`}>
          <div className={BAR_FILL} style={{ width: `${fill * 100}%` }} />
        </div>
      )}
    </>
  );
}
