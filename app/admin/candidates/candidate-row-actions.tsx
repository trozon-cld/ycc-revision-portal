"use client";

import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { RowActions, type RowAction } from "@/components/admin/row-actions";
import { inputClass } from "@/components/admin/styles";
import {
  changeCandidateAdmin,
  deleteCandidate,
  setCandidateBlocked,
  updateCandidateAccess,
  updateCandidateCategory,
  updateCandidateEmail,
  updateCandidatePassword,
} from "./actions";
import { AccessLengthField } from "./access-length-field";

export interface RowCandidate {
  id: string;
  email: string;
  categoryId: string;
  adminId: string;
  isBlocked: boolean;
  expiryLabel: string;
}

export function AdminCandidateActions({
  candidate,
  categories,
  minDate,
  maxDate,
}: {
  candidate: RowCandidate;
  categories: { id: string; name: string }[];
  minDate: string;
  maxDate: string;
}) {
  const { id, email } = candidate;
  const hidden = { candidateId: id };

  const actions: RowAction[] = [
    {
      label: "Change email",
      title: "Change email",
      description: email,
      render: (close) => (
        <ActionForm
          action={updateCandidateEmail}
          hidden={hidden}
          submitLabel="Save email"
          successMessage="Email updated."
          onSuccess={close}
          onCancel={close}
        >
          <Field id={`email-${id}`} label="New email" hint="The candidate will log in with this email from now on.">
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
          action={updateCandidatePassword}
          hidden={hidden}
          submitLabel="Save password"
          successMessage="Password updated."
          onSuccess={close}
          onCancel={close}
        >
          <PasswordFields id={id} />
        </ActionForm>
      ),
    },
    {
      label: "Change category",
      title: "Change category",
      description: email,
      render: (close) => (
        <ActionForm
          action={updateCandidateCategory}
          hidden={hidden}
          submitLabel="Save category"
          successMessage="Category updated."
          onSuccess={close}
          onCancel={close}
        >
          <Field id={`category-${id}`} label="Category">
            <select
              id={`category-${id}`}
              name="categoryId"
              required
              defaultValue={candidate.categoryId}
              className={inputClass}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
        </ActionForm>
      ),
    },
    {
      label: "Change access length",
      title: "Change access length",
      description: email,
      render: (close) => (
        <ActionForm
          action={updateCandidateAccess}
          hidden={hidden}
          submitLabel="Save access"
          successMessage="Access updated."
          onSuccess={close}
          onCancel={close}
        >
          <p className="text-sm text-slate-600">Currently: {candidate.expiryLabel}</p>
          <AccessLengthField idPrefix={`access-${id}`} label="New access length" minDate={minDate} maxDate={maxDate} />
        </ActionForm>
      ),
    },
    candidate.isBlocked
      ? {
          label: "Unblock",
          title: "Unblock candidate?",
          variant: "confirm",
          render: (close) => (
            <ActionForm
              action={setCandidateBlocked}
              hidden={{ ...hidden, blocked: "false" }}
              submitLabel="Unblock"
              pendingLabel="Unblocking…"
              successMessage="Candidate unblocked."
              onSuccess={close}
              onCancel={close}
            >
              <p className="text-sm">
                <strong className="font-medium [overflow-wrap:anywhere]">{email}</strong> will be able to use the
                portal again.
              </p>
            </ActionForm>
          ),
        }
      : {
          label: "Block",
          danger: true,
          title: "Block candidate?",
          variant: "confirm",
          render: (close) => (
            <ActionForm
              action={setCandidateBlocked}
              hidden={{ ...hidden, blocked: "true" }}
              submitLabel="Block"
              pendingLabel="Blocking…"
              variant="danger"
              successMessage="Candidate blocked."
              onSuccess={close}
              onCancel={close}
            >
              <p className="text-sm">
                <strong className="font-medium [overflow-wrap:anywhere]">{email}</strong> won&apos;t be able to use the
                portal until you unblock them. Nothing is deleted.
              </p>
            </ActionForm>
          ),
        },
    {
      label: "Delete",
      danger: true,
      title: "Delete candidate?",
      variant: "confirm",
      render: (close) => (
        <ActionForm
          action={deleteCandidate}
          hidden={hidden}
          submitLabel="Delete"
          pendingLabel="Deleting…"
          variant="danger"
          successMessage="Candidate deleted."
          onSuccess={close}
          onCancel={close}
        >
          <p className="text-sm">
            <strong className="font-medium [overflow-wrap:anywhere]">{email}</strong> and their login history will be
            permanently removed. This can&apos;t be undone.
          </p>
          <p className="text-sm text-slate-600">To stop access temporarily instead, use Block.</p>
        </ActionForm>
      ),
    },
  ];

  return <RowActions label={`Actions for ${email}`} actions={actions} />;
}

export function SuperadminCandidateActions({
  candidate,
  admins,
}: {
  candidate: RowCandidate;
  admins: { id: string; email: string }[];
}) {
  const otherAdmins = admins.filter((admin) => admin.id !== candidate.adminId);

  const actions: RowAction[] = [
    {
      label: "Change admin",
      title: "Move to another admin",
      description: candidate.email,
      render: (close) =>
        otherAdmins.length === 0 ? (
          <p className="px-5 py-4 text-sm">There are no other admins to move this candidate to.</p>
        ) : (
          <ActionForm
            action={changeCandidateAdmin}
            hidden={{ candidateId: candidate.id }}
            submitLabel="Move candidate"
            successMessage="Admin changed."
            onSuccess={close}
            onCancel={close}
          >
            <Field id={`admin-${candidate.id}`} label="New admin">
              <select id={`admin-${candidate.id}`} name="adminId" required defaultValue="" className={inputClass}>
                <option value="" disabled>
                  Select an admin
                </option>
                {otherAdmins.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.email}
                  </option>
                ))}
              </select>
            </Field>
          </ActionForm>
        ),
    },
  ];

  return <RowActions label={`Actions for ${candidate.email}`} actions={actions} />;
}

function PasswordFields({ id }: { id: string }) {
  return (
    <>
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
    </>
  );
}
