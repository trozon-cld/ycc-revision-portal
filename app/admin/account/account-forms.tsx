"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { inputClass } from "@/components/admin/styles";
import { updateOwnEmail, updateOwnPassword } from "./actions";

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  return (
    <ActionForm
      action={updateOwnEmail}
      layout="inline"
      submitLabel="Save email"
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
    </ActionForm>
  );
}

export function ChangePasswordForm() {
  return (
    <ActionForm
      action={updateOwnPassword}
      layout="inline"
      submitLabel="Save password"
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
      <Field id="account-new-password" label="New password" hint="At least 8 characters.">
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
    </ActionForm>
  );
}
