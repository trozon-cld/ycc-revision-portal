"use client";

import { useActionState, useState } from "react";
import {
  deleteAdmin,
  updateAdminEmail,
  updateAdminPassword,
  type AdminActionState,
} from "./actions";

type Panel = "email" | "password" | "delete" | null;

const initialState: AdminActionState = {};

const inputClass =
  "w-full rounded-lg border border-ink/25 bg-surface px-4 py-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40";
const primaryButtonClass =
  "rounded-lg bg-primary px-5 py-3 text-base font-medium text-surface hover:bg-primary/90 disabled:opacity-60";
const secondaryButtonClass =
  "rounded-lg border border-ink/25 bg-surface px-5 py-3 text-base font-medium text-ink hover:bg-ink/5 disabled:opacity-60";

export function AdminItem({
  id,
  email,
  candidateCount,
}: {
  id: string;
  email: string;
  candidateCount: number;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const countLabel = `${candidateCount} candidate${candidateCount === 1 ? "" : "s"}`;

  function open(next: Panel) {
    setNotice(null);
    setPanel(next);
  }

  function done(message: string) {
    setPanel(null);
    setNotice(message);
  }

  return (
    <li className="space-y-3 p-4 text-base text-ink">
      <div>
        <p className="break-all font-medium">{email}</p>
        <p className="text-ink/70">{countLabel}</p>
      </div>

      {panel === null && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => open("email")} className={secondaryButtonClass}>
            Change email
          </button>
          <button type="button" onClick={() => open("password")} className={secondaryButtonClass}>
            Change password
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

      {notice && (
        <p role="status" className="text-green-700">
          {notice}
        </p>
      )}

      {panel === "email" && (
        <EmailPanel
          id={id}
          currentEmail={email}
          onCancel={() => setPanel(null)}
          onDone={() => done("Email updated.")}
        />
      )}
      {panel === "password" && (
        <PasswordPanel
          id={id}
          onCancel={() => setPanel(null)}
          onDone={() => done("Password updated.")}
        />
      )}
      {panel === "delete" && (
        <DeletePanel
          id={id}
          email={email}
          candidateCount={candidateCount}
          countLabel={countLabel}
          onCancel={() => setPanel(null)}
        />
      )}
    </li>
  );
}

function EmailPanel({
  id,
  currentEmail,
  onCancel,
  onDone,
}: {
  id: string;
  currentEmail: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    async (prev: AdminActionState, formData: FormData) => {
      const result = await updateAdminEmail(prev, formData);
      if (result.success) onDone();
      return result;
    },
    initialState
  );
  const inputId = `email-${id}`;

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-ink/15 bg-ink/5 p-4">
      <input type="hidden" name="adminId" value={id} />
      <div className="space-y-2">
        <label htmlFor={inputId} className="block font-medium">
          New email
        </label>
        <input
          id={inputId}
          name="email"
          type="email"
          required
          defaultValue={currentEmail}
          autoComplete="off"
          className={inputClass}
        />
      </div>
      <p className="text-ink/70">This admin will log in with the new email from now on.</p>
      {state.error && (
        <p role="alert" className="text-red-700">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isPending} className={primaryButtonClass}>
          {isPending ? "Saving…" : "Save email"}
        </button>
        <button type="button" onClick={onCancel} disabled={isPending} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PasswordPanel({
  id,
  onCancel,
  onDone,
}: {
  id: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    async (prev: AdminActionState, formData: FormData) => {
      const result = await updateAdminPassword(prev, formData);
      if (result.success) onDone();
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-ink/15 bg-ink/5 p-4">
      <input type="hidden" name="adminId" value={id} />
      <div className="space-y-2">
        <label htmlFor={`password-${id}`} className="block font-medium">
          New password
        </label>
        <input
          id={`password-${id}`}
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor={`confirm-${id}`} className="block font-medium">
          Type the new password again
        </label>
        <input
          id={`confirm-${id}`}
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>
      <p className="text-ink/70">At least 8 characters. Share it with the admin securely.</p>
      {state.error && (
        <p role="alert" className="text-red-700">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isPending} className={primaryButtonClass}>
          {isPending ? "Saving…" : "Save password"}
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
  email,
  candidateCount,
  countLabel,
  onCancel,
}: {
  id: string;
  email: string;
  candidateCount: number;
  countLabel: string;
  onCancel: () => void;
}) {
  const [state, formAction, isPending] = useActionState(deleteAdmin, initialState);
  const hasCandidates = candidateCount > 0;

  return (
    <div role="alert" className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
      {hasCandidates ? (
        <p>
          <strong className="break-all">{email}</strong> can&apos;t be deleted because they own{" "}
          {countLabel}. Move those candidates to another admin first.
        </p>
      ) : (
        <p>
          Delete <strong className="break-all">{email}</strong>? They will no longer be able to log
          in, and their login history will be removed. This can&apos;t be undone.
        </p>
      )}

      {state.error && !hasCandidates && <p className="font-medium">{state.error}</p>}

      <div className="flex flex-wrap gap-2">
        {!hasCandidates && (
          <form action={formAction}>
            <input type="hidden" name="adminId" value={id} />
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
