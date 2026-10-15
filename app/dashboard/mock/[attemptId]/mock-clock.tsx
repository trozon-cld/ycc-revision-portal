import { Icon } from "@/components/icons";

// The mock test clock: minutes and seconds left, green, then amber from 10 minutes, red from 5.
export function MockClock({ seconds, place }: { seconds: number; place: "bar" | "strip" }) {
  const left = Math.max(0, seconds);
  const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const tone =
    left <= 300 ? "border-danger bg-danger-bg text-danger-strong" : left <= 600 ? "border-warn bg-warn-bg text-warn-strong" : "border-ok bg-ok-bg text-ok-strong";
  return (
    <div
      role="timer"
      className={`inline-flex items-center gap-2 rounded-full border-2 font-semibold ${tone} ${place === "bar" ? "h-12 px-3 text-base" : "min-h-11 px-4 text-xl"}`}
    >
      <Icon name="timer" />
      <span className={place === "bar" ? "sr-only" : "text-base font-medium"}>Time left</span>
      <span className="tabular-nums font-bold">{time}</span>
    </div>
  );
}
