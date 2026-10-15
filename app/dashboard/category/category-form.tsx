"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { SwitchableCategory } from "@/lib/candidates/categories";
import { CHOICE_INPUT, CHOICE_ROW, ERROR_BOX, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { NOT_THROUGH_MESSAGE, reachServer } from "@/lib/forms";
import { submitKeepingChoices } from "@/components/candidate/submit-form";
import { SaveCategoryButton } from "./save-button";
import { switchCategory } from "./actions";

type SwitchState = { error: string | null };

// The choice stays selected if saving doesn't go through.
export function CategoryForm({ categories }: { categories: SwitchableCategory[] }) {
  const [chosen, setChosen] = useState(categories.find((category) => category.isCurrent)?.id ?? "");
  const [state, action, pending] = useActionState<SwitchState, FormData>(
    async (_previous, formData) => ((await reachServer(() => switchCategory(formData))) === null ? { error: NOT_THROUGH_MESSAGE } : { error: null }),
    { error: null }
  );
  return (
    <form method="post" onSubmit={submitKeepingChoices(action)} className="mt-5 lg:mt-6">
      <fieldset>
        <legend className="mb-3 text-xl font-bold text-ink">Choose a category</legend>
        <div className="flex flex-col gap-3">
          {categories.map((category) => (
            <label key={category.id} className={CHOICE_ROW}>
              <input
                type="radio"
                name="categoryId"
                value={category.id}
                checked={chosen === category.id}
                onChange={() => setChosen(category.id)}
                required
                className={CHOICE_INPUT}
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-base font-semibold text-ink [overflow-wrap:anywhere]">{category.name}</span>
                {(category.isCurrent || category.isAssigned) && (
                  <span className="text-base text-muted">
                    {[category.isCurrent && "Studying now", category.isAssigned && "Your starting category"].filter(Boolean).join(" · ")}
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
        <SaveCategoryButton pending={pending} />
        <Link href="/dashboard" className={SECONDARY_BUTTON}>
          Back to home
        </Link>
      </div>
    </form>
  );
}
