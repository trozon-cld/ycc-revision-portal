"use client";

import { useActionState, useState } from "react";
import { changeCandidateAdmin, type ChangeAdminState } from "./actions";

const initialState: ChangeAdminState = {};

export function ChangeAdmin({
  candidateId,
  currentAdminId,
  admins,
}: {
  candidateId: string;
  currentAdminId: string;
  admins: { id: string; email: string }[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    async (prev: ChangeAdminState, formData: FormData) => {
      const result = await changeCandidateAdmin(prev, formData);
      if (result.success) {
        setIsOpen(false);
        setNotice("Admin changed.");
      }
      return result;
    },
    initialState
  );
  const selectId = `admin-${candidateId}`;
  const otherAdmins = admins.filter((admin) => admin.id !== currentAdminId);

  if (!isOpen) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setIsOpen(true);
          }}
          className="rounded-lg border border-ink/25 bg-surface px-5 py-3 text-base font-medium text-ink hover:bg-ink/5"
        >
          Change admin
        </button>
        {notice && (
          <p role="status" className="text-green-700">
            {notice}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-ink/15 bg-ink/5 p-4"
    >
      <input type="hidden" name="candidateId" value={candidateId} />
      {otherAdmins.length === 0 ? (
        <p>There are no other admins to move this candidate to.</p>
      ) : (
        <div className="space-y-2">
          <label htmlFor={selectId} className="block font-medium">
            Move to admin
          </label>
          <select
            id={selectId}
            name="adminId"
            required
            defaultValue=""
            className="w-full rounded-lg border border-ink/25 bg-surface px-4 py-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="" disabled>
              Select an admin
            </option>
            {otherAdmins.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.email}
              </option>
            ))}
          </select>
        </div>
      )}

      {state.error && (
        <p role="alert" className="text-red-700">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {otherAdmins.length > 0 && (
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-primary px-5 py-3 text-base font-medium text-surface hover:bg-primary/90 disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          disabled={isPending}
          className="rounded-lg border border-ink/25 bg-surface px-5 py-3 text-base font-medium text-ink hover:bg-ink/5 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
