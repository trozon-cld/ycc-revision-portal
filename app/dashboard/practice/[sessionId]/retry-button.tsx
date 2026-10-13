"use client";

import { useActionState } from "react";
import { ERROR_BOX, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { NOT_THROUGH_MESSAGE, reachServer } from "@/lib/forms";
import { submitKeepingChoices } from "@/components/candidate/submit-form";

type RetryState = { error: string | null };

// "Practise these again" (Practice report) and "Practise the questions you missed" (mock results). The action
// opens the new run; if it doesn't go through, the reason shows here instead of a blank page.
export function RetryForm({
  action,
  field,
  value,
  count,
  label,
  secondary = false,
}: {
  action: (formData: FormData) => Promise<void>;
  field: string;
  value: string;
  count: number;
  label?: string;
  secondary?: boolean;
}) {
  const [state, run, pending] = useActionState<RetryState, FormData>(
    async (_previous, formData) => ((await reachServer(() => action(formData))) === null ? { error: NOT_THROUGH_MESSAGE } : { error: null }),
    { error: null }
  );
  return (
    <form method="post" onSubmit={submitKeepingChoices(run)} className="sm:w-auto">
      <input type="hidden" name={field} value={value} />
      <div aria-live="polite">
        {state.error && (
          <p role="alert" className={`mb-3 ${ERROR_BOX}`}>
            {state.error}
          </p>
        )}
      </div>
      <RetryButton count={count} label={label} secondary={secondary} pending={pending} />
    </form>
  );
}

// Disabled while starting, so a double tap can't start (and then replace) a second run.
function RetryButton({ count, label, secondary, pending }: { count: number; label?: string; secondary: boolean; pending: boolean }) {
  return (
    <button type="submit" disabled={pending} className={`${secondary ? SECONDARY_BUTTON : PRIMARY_BUTTON} w-full`}>
      {pending ? "Starting…" : (label ?? `Practise these ${count} again`)}
    </button>
  );
}
