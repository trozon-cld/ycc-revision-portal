import { Icon } from "@/components/icons";

// Shown the moment Prepare is tapped (app/dashboard/prepare/loading.tsx) and while the reader lays out
// the first pages, so the screen is never blank.
export function OpeningMessage({ text = "Opening your Handbook…", icon = "book" }: { text?: string; icon?: "book" | "practice" | "timer" }) {
  return (
    <div role="status" className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-5 bg-fill p-6 text-center">
      <Icon name={icon} size={64} className="text-primary motion-safe:animate-pulse" />
      <p className="text-xl font-semibold text-ink">{text}</p>
    </div>
  );
}

// Practice and the Mock test: the opening screen fills the screen like the Handbook's (no bar while it loads).
export function FocusedLoading({ text, icon }: { text: string; icon: "practice" | "timer" }) {
  return (
    <div data-focused-owns-header="" className="flex h-dvh flex-col">
      <OpeningMessage text={text} icon={icon} />
    </div>
  );
}
