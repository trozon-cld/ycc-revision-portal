"use client";

import { useActionState } from "react";
import { createAdmin, type CreateAdminState } from "./actions";

const initialState: CreateAdminState = {};

export function CreateAdminForm() {
  const [state, formAction, isPending] = useActionState(
    createAdmin,
    initialState
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-ink/15 p-6"
    >
      <h2 className="text-lg font-medium text-ink">Create admin</h2>

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

      {state.error && (
        <p role="alert" className="text-base text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-base text-green-700">Admin created.</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-primary px-5 py-3 text-base font-medium text-surface hover:bg-primary/90 disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create admin"}
      </button>
    </form>
  );
}
