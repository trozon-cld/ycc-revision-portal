"use client";

import { useActionState } from "react";
import { createCandidate, type CreateCandidateState } from "./actions";

const initialState: CreateCandidateState = {};

export function CreateCandidateForm({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(
    createCandidate,
    initialState
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-gray-200 p-6"
    >
      <h2 className="text-lg font-medium text-gray-900">Create candidate</h2>

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

      <div className="space-y-2">
        <label
          htmlFor="categoryId"
          className="block text-base font-medium text-gray-900"
        >
          Category
        </label>
        <select
          id="categoryId"
          name="categoryId"
          required
          defaultValue=""
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
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

      <p className="text-base text-gray-600">
        Access is granted for 30 days from creation.
      </p>

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
        className="rounded-lg bg-gray-900 px-5 py-3 text-base font-medium text-white hover:bg-gray-700 disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create candidate"}
      </button>
    </form>
  );
}
