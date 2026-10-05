// The mock test clock: minutes and seconds left, green, then amber from 10 minutes, red from 5.
export function MockClock({ seconds, place }: { seconds: number; place: "bar" | "strip" }) {
  const left = Math.max(0, seconds);
  const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const tone =
    left <= 300 ? "border-red-700 bg-red-50 text-red-800" : left <= 600 ? "border-amber-600 bg-amber-50 text-amber-950" : "border-green-700 bg-green-50 text-green-900";
  return (
    <div
      role="timer"
      className={`inline-flex items-center gap-2 rounded-lg border-2 font-semibold ${tone} ${place === "bar" ? "h-12 px-3 text-lg" : "min-h-11 px-4 text-xl"}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M9.5 2h5" />
      </svg>
      <span className={place === "bar" ? "sr-only" : "text-lg font-medium"}>Time left</span>
      <span className="tabular-nums font-bold">{time}</span>
    </div>
  );
}
