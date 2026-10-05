import { FocusedShell } from "@/components/learning/focused-shell";
import { OpeningMessage } from "@/components/learning/opening-message";

// Shown at once when a practice starts or is continued, while its question loads.
export default function Loading() {
  return (
    <FocusedShell label="Practice tools" status="Practice">
      <OpeningMessage text="Opening your practice…" icon="practice" />
    </FocusedShell>
  );
}
