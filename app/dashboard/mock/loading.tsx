import { FocusedShell } from "@/components/learning/focused-shell";
import { OpeningMessage } from "@/components/learning/opening-message";

// Shown at once when Mock test is tapped, in the same frame as the page that follows.
export default function Loading() {
  return (
    <FocusedShell label="Mock test tools" status="Mock test">
      <OpeningMessage text="Opening Mock test…" icon="timer" />
    </FocusedShell>
  );
}
