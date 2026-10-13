"use client";

import { useFormStatus } from "react-dom";
import { PRIMARY_BUTTON } from "@/components/candidate/buttons";

// Disabled while saving, so a double tap can't send the change twice.
export function SaveCategoryButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
      {pending ? "Saving…" : "Save category"}
    </button>
  );
}
