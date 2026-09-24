"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton, RowActions, type RowAction } from "@/components/admin/row-actions";
import { buttonClass, inputClass } from "@/components/admin/styles";
import { createAdmin, deleteAdmin, updateAdminEmail, updateAdminPassword } from "./actions";

export function NewAdminButton() {
  return (
    <PanelButton label="New admin" title="New admin">
      {(close) => (
        <ActionForm
          action={createAdmin}
          submitLabel="Create admin"
          pendingLabel="Creating…"
          successMessage="Admin created."
          onSuccess={close}
          onCancel={close}
        >
          <Field id="new-admin-email" label="Email">
            <input id="new-admin-email" name="email" type="email" required autoComplete="off" className={inputClass} />
          </Field>
          <Field id="new-admin-password" label="Password" hint="At least 8 characters.">
            <input
              id="new-admin-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
        </ActionForm>
      )}
    </PanelButton>
  );
}

export function AdminRowActions({
  id,
  email,
  candidateCount,
}: {
  id: string;
  email: string;
  candidateCount: number;
}) {
  const hidden = { adminId: id };
  const countLabel = `${candidateCount} candidate${candidateCount === 1 ? "" : "s"}`;

  const actions: RowAction[] = [
    {
      label: "Change email",
      title: "Change email",
      description: email,
      render: (close) => (
        <ActionForm
          action={updateAdminEmail}
          hidden={hidden}
          submitLabel="Save email"
          successMessage="Email updated."
          onSuccess={close}
          onCancel={close}
        >
          <Field id={`email-${id}`} label="New email" hint="This admin will log in with this email from now on.">
            <input
              id={`email-${id}`}
              name="email"
              type="email"
              required
              defaultValue={email}
              autoComplete="off"
              className={inputClass}
            />
          </Field>
        </ActionForm>
      ),
    },
    {
      label: "Change password",
      title: "Change password",
      description: email,
      render: (close) => (
        <ActionForm
          action={updateAdminPassword}
          hidden={hidden}
          submitLabel="Save password"
          successMessage="Password updated."
          onSuccess={close}
          onCancel={close}
        >
          <Field id={`password-${id}`} label="New password" hint="At least 8 characters. Share it with them securely.">
            <input
              id={`password-${id}`}
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
          <Field id={`confirm-${id}`} label="Type the new password again">
            <input
              id={`confirm-${id}`}
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
        </ActionForm>
      ),
    },
    {
      label: "Delete",
      danger: true,
      title: candidateCount > 0 ? "Can't delete this admin" : "Delete admin?",
      variant: "confirm",
      render: (close) =>
        candidateCount > 0 ? (
          <div>
            <p className="px-5 py-4 text-sm">
              <strong className="font-medium [overflow-wrap:anywhere]">{email}</strong> owns {countLabel}. Move them to
              another admin from the Candidates page first.
            </p>
            <div className="flex justify-end border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={close} className={buttonClass("secondary")}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <ActionForm
            action={deleteAdmin}
            hidden={hidden}
            submitLabel="Delete"
            pendingLabel="Deleting…"
            variant="danger"
            successMessage="Admin deleted."
            onSuccess={close}
            onCancel={close}
          >
            <p className="text-sm">
              <strong className="font-medium [overflow-wrap:anywhere]">{email}</strong> will no longer be able to log
              in, and their login history will be removed. This can&apos;t be undone.
            </p>
          </ActionForm>
        ),
    },
  ];

  return <RowActions label={`Actions for ${email}`} actions={actions} />;
}
