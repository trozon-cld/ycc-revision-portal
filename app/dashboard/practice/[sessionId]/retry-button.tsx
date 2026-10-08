"use client";

import { useFormStatus } from "react-dom";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";

// Disabled while starting, so a double tap can't start (and then replace) a second run.
export function RetryButton({ count, label, secondary = false }: { count: number; label?: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${secondary ? SECONDARY_BUTTON : PRIMARY_BUTTON} w-full`}>
      {pending ? "Starting…" : (label ?? `Practise these ${count} again`)}
    </button>
  );
}
