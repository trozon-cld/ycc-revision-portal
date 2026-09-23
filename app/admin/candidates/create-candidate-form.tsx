"use client";

import { useActionState, useState } from "react";
import { createCandidate, type CreateCandidateState } from "./actions";
import { AccessLengthField } from "./access-length-field";

const initialState: CreateCandidateState = {};

export function CreateCandidateForm({
  categories,
  minDate,
  maxDate,
}: {
  categories: { id: string; name: string }[];
  minDate: string;
  maxDate: string;
}) {
  // Bumped on success so the access field resets along with the form.
  const [resetKey, setResetKey] = useState(0);
  const [state, formAction, isPending] = useActionState(
    async (prev: CreateCandidateState, formData: FormData) => {
      const result = await createCandidate(prev, formData);
      if (result.success) setResetKey((key) => key + 1);
      return result;
    },
    initialState
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-ink/15 p-6"
    >
      <h2 className="text-lg font-medium text-ink">Create candidate</h2>

      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-base font-medium text-ink"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-lg border border-ink/25 px-4 py-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-base font-medium text-ink"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full rounded-lg border border-ink/25 px-4 py-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="categoryId"
          className="block text-base font-medium text-ink"
        >
          Category
        </label>
        <select
          id="categoryId"
          name="categoryId"
          required
          defaultValue=""
          className="w-full rounded-lg border border-ink/25 px-4 py-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="" disabled>
            Select a category
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <AccessLengthField
        key={resetKey}
        idPrefix="create"
        label="Access length"
        minDate={minDate}
        maxDate={maxDate}
      />

      {state.error && (
        <p role="alert" className="text-base text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-base text-green-700">Candidate created.</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-primary px-5 py-3 text-base font-medium text-surface hover:bg-primary/90 disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create candidate"}
      </button>
    </form>
  );
}
