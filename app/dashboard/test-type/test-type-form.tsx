"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { SwitchableTestType } from "@/lib/candidates/test-types";
import { CHOICE_INPUT, CHOICE_ROW, ERROR_BOX, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { NOT_THROUGH_MESSAGE, reachServer } from "@/lib/forms";
import { submitKeepingChoices } from "@/components/candidate/submit-form";
import { SaveTestTypeButton } from "./save-button";
import { switchTestType } from "./actions";

type SwitchState = { error: string | null };

// The choice stays selected if saving doesn't go through.
export function TestTypeForm({ testTypes }: { testTypes: SwitchableTestType[] }) {
  const [chosen, setChosen] = useState(testTypes.find((testType) => testType.isCurrent)?.id ?? "");
  const [state, action, pending] = useActionState<SwitchState, FormData>(
    async (_previous, formData) => ((await reachServer(() => switchTestType(formData))) === null ? { error: NOT_THROUGH_MESSAGE } : { error: null }),
    { error: null }
  );
  return (
    <form method="post" onSubmit={submitKeepingChoices(action)} className="mt-5 lg:mt-6">
      <fieldset>
        <legend className="mb-3 text-xl font-bold text-ink">Choose a test type</legend>
        <div className="flex flex-col gap-3">
          {testTypes.map((testType) => (
            <label key={testType.id} className={CHOICE_ROW}>
              <input
                type="radio"
                name="testTypeId"
                value={testType.id}
                checked={chosen === testType.id}
                onChange={() => setChosen(testType.id)}
                required
                className={CHOICE_INPUT}
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-base font-semibold text-ink [overflow-wrap:anywhere]">{testType.name}</span>
                {(testType.isCurrent || testType.isAssigned) && (
                  <span className="text-base text-muted">
                    {[testType.isCurrent && "Studying now", testType.isAssigned && "Your starting test type"].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div aria-live="polite">
        {state.error && (
          <p role="alert" className={`mt-5 lg:mt-6 ${ERROR_BOX}`}>
            {state.error}
          </p>
        )}
      </div>

      <div className="mt-5 lg:mt-6 flex flex-col gap-3 sm:flex-row">
        <SaveTestTypeButton pending={pending} />
        <Link href="/dashboard" className={SECONDARY_BUTTON}>
          Back to home
        </Link>
      </div>
    </form>
  );
}
