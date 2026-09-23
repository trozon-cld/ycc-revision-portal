"use client";

import { useActionState } from "react";
import { createCategory, type CategoryActionState } from "./actions";

const initialState: CategoryActionState = {};

export function CreateCategoryForm() {
  const [state, formAction, isPending] = useActionState(
    createCategory,
    initialState
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-ink/15 p-6"
    >
      <h2 className="text-lg font-medium text-ink">Add category</h2>

      <div className="space-y-2">
        <label htmlFor="name" className="block text-base font-medium text-ink">
          Category name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={100}
          className="w-full rounded-lg border border-ink/25 px-4 py-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {state.error && (
        <p role="alert" className="text-base text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-base text-green-700">Category added.</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-primary px-5 py-3 text-base font-medium text-surface hover:bg-primary/90 disabled:opacity-60"
      >
        {isPending ? "Adding…" : "Add category"}
      </button>
    </form>
  );
}
