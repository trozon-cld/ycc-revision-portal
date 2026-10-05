"use client";

import { useFormStatus } from "react-dom";
import { PRIMARY_BUTTON } from "@/components/candidate/buttons";

// Disabled while starting, so a double tap can't start (and then replace) a second run.
export function RetryButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${PRIMARY_BUTTON} w-full`}>
      {pending ? "Starting…" : `Practise these ${count} again`}
    </button>
  );
}
