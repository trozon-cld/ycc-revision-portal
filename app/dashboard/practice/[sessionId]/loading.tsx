import { FocusedLoading } from "@/components/learning/opening-message";

// Shown at once when a practice starts or is continued, while its question loads.
export default function Loading() {
  return <FocusedLoading text="Opening your practice…" icon="practice" />;
}
