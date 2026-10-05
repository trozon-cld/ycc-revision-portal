"use client";

import { useActionState } from "react";
import { PRIMARY_BUTTON } from "@/components/candidate/buttons";
import { startMockForm, type MockStartState } from "./actions";

// Start mock test: disabled while starting, so a double tap can't start two tests.
export function StartMock() {
  const [state, action, pending] = useActionState<MockStartState, FormData>(startMockForm, { error: null });
  return (
    <form action={action} className="mt-8">
      <div aria-live="polite">
        {state.error && (
          <p role="alert" className="mb-4 rounded-xl border-2 border-red-700 bg-red-50 p-4 text-lg font-semibold text-red-800">
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
