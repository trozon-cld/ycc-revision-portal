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
      className="space-y-4 rounded-xl border border-gray-200 p-6"
    >
      <h2 className="text-lg font-medium text-gray-900">Create admin</h2>

      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-base font-medium text-gray-900"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-base font-medium text-gray-900"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
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
        className="rounded-lg bg-gray-900 px-5 py-3 text-base font-medium text-white hover:bg-gray-700 disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create admin"}
      </button>
    </form>
  );
}
