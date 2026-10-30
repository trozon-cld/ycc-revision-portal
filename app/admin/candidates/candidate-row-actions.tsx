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
  updateCandidateTestType,
  updateCandidateEmail,
  updateCandidateName,
  updateCandidatePassword,
} from "./actions";
import { candidateProgressPath } from "@/lib/candidates/paths";
import { NAME_MAX_LENGTH } from "@/lib/users/name";
import { MAX_EMAIL_LENGTH, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/users/credentials";
import { AccessLengthField } from "./access-length-field";
import { TestTypeOptions, type TestTypeChoice } from "./test-type-options";

export interface RowCandidate {
  id: string;
  email: string;
  name: string | null;
  testTypeId: string;
  // "Supervisor (assigned: General Operative)" when they have switched.
  testTypeLabel: string;
  adminId: string;
  isBlocked: boolean;
  expiryLabel: string;
  // YYYY-MM-DD that access presets add to (the current end date, or today once it has passed).
  accessBase: string;
}

export function AdminCandidateActions({
  candidate,
  testTypes,
  minDate,
  maxDate,
  onProgressPage = false,
}: {
  candidate: RowCandidate;
  testTypes: TestTypeChoice[];
  minDate: string;
  maxDate: string;
  // On the Progress page: no "View progress", and deleting goes back to the list.
  onProgressPage?: boolean;
}) {
  const { id, email } = candidate;
  const hidden = { candidateId: id };

  const actions: RowAction[] = [
    ...(onProgressPage ? [] : [{ label: "View progress", href: candidateProgressPath(id) }]),
    {
      label: "Change name",
      title: "Change name",
      description: email,
      render: (close) => (
        <ActionForm
          action={updateCandidateName}
          hidden={hidden}
          submitLabel="Save name"
          successMessage="Name updated."
          onSuccess={close}
          onCancel={close}
        >
          <Field id={`name-${id}`} label="Name">
            <input
              id={`name-${id}`}
              name="name"
              type="text"
              required
              maxLength={NAME_MAX_LENGTH}
              defaultValue={candidate.name ?? ""}
              autoComplete="off"
              className={inputClass}
            />
          </Field>
        </ActionForm>
      ),
    },
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
              type="email" maxLength={MAX_EMAIL_LENGTH}
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
      label: "Change test type",
      title: "Change test type",
      description: email,
      render: (close) => (
        <ActionForm
          action={updateCandidateTestType}
          hidden={hidden}
          submitLabel="Save test type"
          successMessage="Test type updated."
          onSuccess={close}
          onCancel={close}
        >
          <p className="text-sm text-slate-600">Currently: {candidate.testTypeLabel}</p>
          <Field
            id={`test-type-${id}`}
            label="Assigned test type"
            hint="The candidate is moved to this test type now. They can switch to others in the same test area. If they're in a mock test, it ends now with the answers saved so far."
          >
            <select
              id={`test-type-${id}`}
              name="testTypeId"
              required
              defaultValue={candidate.testTypeId}
              className={inputClass}
            >
              <TestTypeOptions testTypes={testTypes} />
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
          <AccessLengthField
            idPrefix={`access-${id}`}
            label="New access length"
            minDate={minDate}
            maxDate={maxDate}
            base={candidate.accessBase}
          />
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
          hidden={onProgressPage ? { ...hidden, back: "list" } : hidden}
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

  return <RowActions label={`Actions for ${email}`} actions={actions} triggerText={onProgressPage ? "Actions" : undefined} />;
}

export function SuperadminCandidateActions({
  candidate,
  admins,
  onProgressPage = false,
}: {
  candidate: RowCandidate;
  // label: "Name (email)", or the email when there is no name.
  admins: { id: string; label: string }[];
  onProgressPage?: boolean;
}) {
  const otherAdmins = admins.filter((admin) => admin.id !== candidate.adminId);

  const actions: RowAction[] = [
    ...(onProgressPage ? [] : [{ label: "View progress", href: candidateProgressPath(candidate.id) }]),
    {
      label: "Change Admin",
      title: "Change Admin",
      description: candidate.email,
      render: (close) =>
        otherAdmins.length === 0 ? (
          <p className="px-5 py-4 text-sm">There are no other Admins to move this candidate to.</p>
        ) : (
          <ActionForm
            action={changeCandidateAdmin}
            hidden={{ candidateId: candidate.id }}
            submitLabel="Save Admin"
            successMessage="Admin updated."
            onSuccess={close}
            onCancel={close}
          >
            <Field id={`admin-${candidate.id}`} label="New Admin">
              <select id={`admin-${candidate.id}`} name="adminId" required defaultValue="" className={inputClass}>
                <option value="" disabled>
                  Select an Admin
                </option>
                {otherAdmins.map((admin) => (
                  <option key={admin.id} value={admin.id}>
                    {admin.label}
                  </option>
                ))}
              </select>
            </Field>
          </ActionForm>
        ),
    },
  ];

  return <RowActions label={`Actions for ${candidate.email}`} actions={actions} triggerText={onProgressPage ? "Actions" : undefined} />;
}

function PasswordFields({ id }: { id: string }) {
  return (
    <>
      <Field id={`password-${id}`} label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters. Share it with them securely.`}>
        <input
          id={`password-${id}`}
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
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
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>
    </>
  );
}
