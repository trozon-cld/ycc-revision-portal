"use client";

import { useActionState } from "react";
import { ERROR_BOX, PRIMARY_BUTTON } from "@/components/candidate/buttons";
import { NOT_THROUGH_MESSAGE, reachServer } from "@/lib/forms";
import { submitKeepingChoices } from "@/components/candidate/submit-form";
import { startMockForm, type MockStartState } from "./actions";

// Start mock test: disabled while starting, so a double tap can't start two tests.
export function StartMock() {
  const [state, action, pending] = useActionState<MockStartState, FormData>(
    async (previous) => (await reachServer(() => startMockForm(previous))) ?? { error: NOT_THROUGH_MESSAGE },
    { error: null }
  );
  return (
    <form method="post" onSubmit={submitKeepingChoices(action)} className="mt-8">
      <div aria-live="polite">
        {state.error && (
          <p role="alert" className={`mb-4 ${ERROR_BOX}`}>
            {state.error}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} className={`${PRIMARY_BUTTON} w-full sm:w-auto`}>
        {pending ? "Starting…" : "Start mock test"}
      </button>
    </form>
  );
}
