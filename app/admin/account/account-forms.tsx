"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { inputClass } from "@/components/admin/styles";
import { NAME_MAX_LENGTH } from "@/lib/users/name";
import { updateOwnEmail, updateOwnName, updateOwnPassword } from "./actions";

export function ChangeNameForm({ currentName }: { currentName: string | null }) {
  return (
    <ActionForm action={updateOwnName} layout="inline" submitLabel="Save name" successMessage="Name updated.">
      <Field id="account-name" label="Your name" hint="Shown in the sidebar, under your email.">
        <input
          id="account-name"
          name="name"
          type="text"
          required
          maxLength={NAME_MAX_LENGTH}
          defaultValue={currentName ?? ""}
          autoComplete="name"
          className={inputClass}
        />
      </Field>
    </ActionForm>
  );
}

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
