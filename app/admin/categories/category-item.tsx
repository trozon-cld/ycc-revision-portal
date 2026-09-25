"use client";

import { useActionState, useState } from "react";
import {
  deleteCategory,
  renameCategory,
  type CategoryActionState,
} from "./actions";

type Panel = "rename" | "delete" | null;

const initialState: CategoryActionState = {};

const secondaryButtonClass =
  "rounded-lg border border-ink/25 bg-surface px-5 py-3 text-base font-medium text-ink hover:bg-ink/5 disabled:opacity-60";

export function CategoryItem({
  id,
  name,
  candidateCount,
}: {
  id: string;
  name: string;
  candidateCount: number;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const countLabel = `${candidateCount} candidate${candidateCount === 1 ? "" : "s"}`;

  function open(next: Panel) {
    setNotice(null);
    setPanel(next);
  }

  return (
    <li className="space-y-3 p-4 text-base text-ink">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="break-words font-medium">{name}</p>
          <p className="text-ink/70">{countLabel}</p>
        </div>
        {panel === null && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => open("rename")} className={secondaryButtonClass}>
              Rename
            </button>
            <button
              type="button"
              onClick={() => open("delete")}
              className="rounded-lg border border-red-700 px-5 py-3 text-base font-medium text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {notice && (
        <p role="status" className="text-green-700">
          {notice}
        </p>
      )}

      {panel === "rename" && (
        <RenamePanel
          id={id}
          name={name}
          onCancel={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            setNotice("Category renamed.");
          }}
        />
      )}

      {panel === "delete" && (
        <DeletePanel
          id={id}
          name={name}
          candidateCount={candidateCount}
          countLabel={countLabel}
          onCancel={() => setPanel(null)}
        />
      )}
    </li>
  );
}

function RenamePanel({
  id,
  name,
  onCancel,
  onDone,
}: {
  id: string;
  name: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    async (prev: CategoryActionState, formData: FormData) => {
      const result = await renameCategory(prev, formData);
      if (result.success) onDone();
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-ink/15 bg-ink/5 p-4">
      <input type="hidden" name="categoryId" value={id} />
      <div className="space-y-2">
        <label htmlFor={`rename-${id}`} className="block font-medium">
          New name
        </label>
        <input
          id={`rename-${id}`}
          name="name"
          type="text"
          required
          maxLength={100}
          defaultValue={name}
          className="w-full rounded-lg border border-ink/25 bg-surface px-4 py-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
      <p className="text-ink/70">Candidates in this category keep their place — only the name changes.</p>
      {state.error && (
        <p role="alert" className="text-red-700">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-primary px-5 py-3 text-base font-medium text-surface hover:bg-primary/90 disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save name"}
        </button>
        <button type="button" onClick={onCancel} disabled={isPending} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeletePanel({
  id,
  name,
  candidateCount,
  countLabel,
  onCancel,
}: {
  id: string;
  name: string;
  candidateCount: number;
  countLabel: string;
  onCancel: () => void;
}) {
  const [state, formAction, isPending] = useActionState(deleteCategory, initialState);
  const hasCandidates = candidateCount > 0;

  return (
    <div role="alert" className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
      {hasCandidates ? (
        <p>
          <strong>{name}</strong> can&apos;t be deleted because it has {countLabel}. Their admins
          need to move them to another category first.
        </p>
      ) : (
        <p>
          Delete <strong>{name}</strong>? Admins will no longer be able to choose it for new
          candidates. This can&apos;t be undone.
        </p>
      )}

      {state.error && !hasCandidates && <p className="font-medium">{state.error}</p>}

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
        <button type="button" onClick={onCancel} disabled={isPending} className={secondaryButtonClass}>
          {hasCandidates ? "Close" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
