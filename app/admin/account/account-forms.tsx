"use client";

import { useActionState, useState, type ReactNode } from "react";
import { updateOwnEmail, updateOwnPassword, type AccountActionState } from "./actions";

const initialState: AccountActionState = {};

const inputClass =
  "w-full rounded-lg border border-ink/25 bg-surface px-4 py-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40";

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction, isPending] = useActionState(updateOwnEmail, initialState);

  return (
    <FormCard
      title="Change email"
      action={formAction}
      isPending={isPending}
      submitLabel="Save email"
      state={state}
      successMessage="Email updated. Use it next time you log in."
    >
      <Field id="account-email" label="New email">
        <input
          id="account-email"
          name="email"
          type="email"
          required
          defaultValue={currentEmail}
          autoComplete="email"
          className={inputClass}
        />
      </Field>
      <Field id="account-email-password" label="Current password">
        <input
          id="account-email-password"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </Field>
    </FormCard>
  );
}

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(updateOwnPassword, initialState);

  return (
    <FormCard
      title="Change password"
      action={formAction}
      isPending={isPending}
      submitLabel="Save password"
      state={state}
      successMessage="Password updated. Use it next time you log in."
    >
      <Field id="account-current-password" label="Current password">
        <input
          id="account-current-password"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </Field>
      <Field id="account-new-password" label="New password">
        <input
          id="account-new-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>
      <Field id="account-confirm-password" label="Type the new password again">
        <input
          id="account-confirm-password"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>
      <p className="text-base text-ink/70">At least 8 characters.</p>
    </FormCard>
  );
}

function FormCard({
  title,
  action,
  isPending,
  submitLabel,
  state,
  successMessage,
  children,
}: {
  title: string;
  action: (formData: FormData) => void;
  isPending: boolean;
  submitLabel: string;
  state: AccountActionState;
  successMessage: string;
  children: ReactNode;
}) {
  return (
    <form action={action} className="space-y-4 rounded-xl border border-ink/15 p-6">
      <h2 className="text-lg font-medium text-ink">{title}</h2>
      {children}
      {state.error && (
        <p role="alert" className="text-base text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-base text-green-700">
          {successMessage}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-primary px-5 py-3 text-base font-medium text-surface hover:bg-primary/90 disabled:opacity-60"
      >
        {isPending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-base font-medium text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}
