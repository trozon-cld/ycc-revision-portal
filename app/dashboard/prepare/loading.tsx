import { OpeningMessage } from "@/components/learning/opening-message";

// Shown at once when Prepare is tapped, while the book loads. Same frame as the reader, so nothing
// jumps when it arrives (on phones the header gives way to the reader bar, as it will then).
export default function Loading() {
  return (
    <div
      data-reader-owns-header=""
      className="flex h-[calc(100dvh-var(--candidate-header))] min-h-[480px] flex-col lg:h-dvh phone-upright:h-dvh phone-sideways:h-dvh phone-sideways:min-h-0"
    >
      <OpeningMessage />
    </div>
  );
}
