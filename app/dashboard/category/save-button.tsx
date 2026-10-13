"use client";

import { PRIMARY_BUTTON } from "@/components/candidate/buttons";

// Disabled while saving, so a double tap can't send the change twice.
export function SaveCategoryButton({ pending }: { pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
      {pending ? "Saving…" : "Save category"}
    </button>
  );
}
