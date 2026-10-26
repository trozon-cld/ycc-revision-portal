import { GOOGLE_FREE_CHARACTERS_PER_MONTH, VOICE_CHARACTERS_PER_HOUR } from "@/lib/voice/limits";
import type { VoiceUsageKind, VoiceUsageSummary } from "@/lib/voice/quota";

const SERVICE_NAMES: Record<string, string> = { google: "Google", gemini: "Gemini", fake: "the test service" };
const LINES: { kind: VoiceUsageKind; label: string }[] = [
  { kind: "translate", label: "Translation" },
  { kind: "speech", label: "Audio" },
];

const number = (n: number) => n.toLocaleString("en-GB");

// Both Languages and audio tabs: this staff member's hourly allowance, and everyone's characters this month per service.
export function VoiceUsage({ usage }: { usage: VoiceUsageSummary }) {
  return (
    <ul aria-label="Voice service use" className="mb-4 space-y-0.5 text-sm text-slate-700">
      {LINES.map(({ kind, label }) => {
        const month = usage.month.filter((row) => row.kind === kind && row.characters > 0);
        const monthText =
          month.length === 0
            ? "none yet"
            : month
                .map((row) =>
                  row.service === "google"
                    ? `${number(row.characters)} with Google (${number(GOOGLE_FREE_CHARACTERS_PER_MONTH[kind])} free)`
                    : `${number(row.characters)} with ${SERVICE_NAMES[row.service] ?? row.service}`
                )
                .join(", ");
        return (
          <li key={kind}>
            <span className="font-medium text-ink">{label} this hour:</span> {number(usage.hour[kind])} of {number(VOICE_CHARACTERS_PER_HOUR[kind])}{" "}
            characters (you) · <span className="font-medium text-ink">This month:</span> {monthText} (everyone)
          </li>
        );
      })}
    </ul>
  );
}
