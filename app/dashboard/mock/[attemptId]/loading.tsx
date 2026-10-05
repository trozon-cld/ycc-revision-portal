import { FocusedShell } from "@/components/learning/focused-shell";
import { OpeningMessage } from "@/components/learning/opening-message";

export default function Loading() {
  return (
    <FocusedShell label="Mock test tools" status="Mock test">
      <OpeningMessage text="Opening your mock test…" icon="timer" />
    </FocusedShell>
  );
}
