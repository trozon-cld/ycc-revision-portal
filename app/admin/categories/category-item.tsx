"use client";

import { useActionState, useState } from "react";
import { deleteCategory, type CategoryActionState } from "./actions";

const initialState: CategoryActionState = {};

export function CategoryItem({
  id,
  name,
  candidateCount,
}: {
  id: string;
  name: string;
  candidateCount: number;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [state, formAction, isPending] = useActionState(
    deleteCategory,
    initialState
  );
  const hasCandidates = candidateCount > 0;
  const countLabel = `${candidateCount} candidate${candidateCount === 1 ? "" : "s"}`;

  return (
    <li className="space-y-3 p-4 text-base text-ink">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-ink/70">{countLabel}</p>
        </div>
        {!isConfirming && (
          <button
            type="button"
            onClick={() => setIsConfirming(true)}
            className="self-start rounded-lg border border-red-700 px-5 py-3 text-base font-medium text-red-700 hover:bg-red-50 sm:self-auto"
          >
            Delete
          </button>
        )}
      </div>

      {isConfirming && (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900"
        >
          {hasCandidates ? (
            <p>
              <strong>{name}</strong> can&apos;t be deleted because it has{" "}
              {countLabel}. Their admins need to move them to another category
              first.
            </p>
          ) : (
            <p>
              Delete <strong>{name}</strong>? Admins will no longer be able to
              choose it for new candidates. This can&apos;t be undone.
            </p>
          )}

          {state.error && !hasCandidates && (
            <p className="font-medium">{state.error}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {!hasCandidates && (
              <form action={formAction}>
                <input type="hidden" name="categoryId" value={id} />
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-red-700 px-5 py-3 text-base font-medium text-surface hover:bg-red-800 disabled:opacity-60"
                >
                  {isPending ? "Deleting…" : "Yes, delete"}
                </button>
              </form>
            )}
            <button
              type="button"
              onClick={() => setIsConfirming(false)}
              disabled={isPending}
              className="rounded-lg border border-ink/25 bg-surface px-5 py-3 text-base font-medium text-ink hover:bg-ink/5 disabled:opacity-60"
            >
              {hasCandidates ? "Close" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
