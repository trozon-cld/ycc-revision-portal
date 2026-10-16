import { FocusedLoading } from "@/components/learning/opening-message";

// Shown at once when Mock test is tapped, until the page arrives.
export default function Loading() {
  return <FocusedLoading text="Opening Mock test…" icon="timer" />;
}
