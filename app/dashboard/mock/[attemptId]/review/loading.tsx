import { FocusedShell } from "@/components/learning/focused-shell";
import { OpeningMessage } from "@/components/learning/opening-message";

export default function Loading() {
  return (
    <FocusedShell label="Mock test tools" status="Your answers">
      <OpeningMessage text="Opening your answers…" icon="timer" />
    </FocusedShell>
  );
}
