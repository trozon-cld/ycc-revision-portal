import { OpeningMessage } from "@/components/learning/opening-message";
import { PracticeShell } from "./practice-shell";

// Shown at once when Practice is tapped, in the same frame as the page that follows.
export default function Loading() {
  return (
    <PracticeShell status="Practice">
      <OpeningMessage text="Opening Practice…" icon="practice" />
    </PracticeShell>
  );
}
