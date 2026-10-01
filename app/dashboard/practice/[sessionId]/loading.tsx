import { OpeningMessage } from "@/components/learning/opening-message";
import { PracticeShell } from "../practice-shell";

// Shown at once when a practice starts or is continued, while its question loads.
export default function Loading() {
  return (
    <PracticeShell status="Practice">
      <OpeningMessage text="Opening your practice…" icon="practice" />
    </PracticeShell>
  );
}
