import { FocusedLoading } from "@/components/learning/opening-message";

// Shown at once when Practice is tapped, until the page arrives.
export default function Loading() {
  return <FocusedLoading text="Opening Practice…" icon="practice" />;
}
