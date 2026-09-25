"use client";

import { useActionState, useState, type ReactNode } from "react";
import {
  deleteCandidate,
  setCandidateBlocked,
  updateCandidateAccess,
  updateCandidateCategory,
  updateCandidateEmail,
  updateCandidatePassword,
  type CandidateActionState,
} from "./actions";
import { AccessLengthField } from "./access-length-field";

type Panel = "menu" | "email" | "password" | "category" | "access" | "block" | "delete" | null;
type Action = (prev: CandidateActionState, formData: FormData) => Promise<CandidateActionState>;

const initialState: CandidateActionState = {};

const inputClass =
  "w-full rounded-lg border border-ink/25 bg-surface px-4 py-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40";
const primaryButtonClass =
  "rounded-lg bg-primary px-5 py-3 text-base font-medium text-surface hover:bg-primary/90 disabled:opacity-60";
const secondaryButtonClass =
  "rounded-lg border border-ink/25 bg-surface px-5 py-3 text-base font-medium text-ink hover:bg-ink/5 disabled:opacity-60";
const dangerButtonClass =
  "rounded-lg bg-red-700 px-5 py-3 text-base font-medium text-surface hover:bg-red-800 disabled:opacity-60";
const dangerOutlineClass =
  "rounded-lg border border-red-700 bg-surface px-5 py-3 text-base font-medium text-red-700 hover:bg-red-50 disabled:opacity-60";

export interface ManagedCandidate {
  id: string;
  email: string;
  categoryId: string;
  isBlocked: boolean;
  expiryLabel: string;
}

export function CandidateManager({
  candidate,
  categories,
  minDate,
  maxDate,
}: {
  candidate: ManagedCandidate;
  categories: { id: string; name: string }[];
  minDate: string;
  maxDate: string;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function open(next: Panel) {
    setNotice(null);
    setPanel(next);
  }

  function done(message: string) {
    setPanel(null);
    setNotice(message);
  }

  const close = () => setPanel(null);
  const id = candidate.id;

  return (
    <div className="space-y-3">
      {panel === null && (
        <button type="button" onClick={() => open("menu")} className={secondaryButtonClass}>
          Manage
        </button>
      )}

      {notice && (
        <p role="status" className="text-green-700">
          {notice}
        </p>
      )}

      {panel === "menu" && (
        <div className="space-y-3 rounded-lg border border-ink/15 bg-ink/5 p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => open("email")} className={secondaryButtonClass}>
              Change email
            </button>
            <button type="button" onClick={() => open("password")} className={secondaryButtonClass}>
              Change password
            </button>
            <button type="button" onClick={() => open("category")} className={secondaryButtonClass}>
              Change category
            </button>
            <button type="button" onClick={() => open("access")} className={secondaryButtonClass}>
              Change access length
            </button>
            {candidate.isBlocked ? (
              <UnblockButton id={id} onDone={() => done("Candidate unblocked.")} />
            ) : (
              <button type="button" onClick={() => open("block")} className={dangerOutlineClass}>
                Block
              </button>
            )}
            <button type="button" onClick={() => open("delete")} className={dangerOutlineClass}>
              Delete
            </button>
          </div>
          <button type="button" onClick={close} className={`${secondaryButtonClass} w-full sm:w-auto`}>
            Close
          </button>
        </div>
      )}

      {panel === "email" && (
        <ActionPanel
          id={id}
          action={updateCandidateEmail}
          submitLabel="Save email"
          onCancel={close}
          onDone={() => done("Email updated.")}
        >
          <Field id={`email-${id}`} label="New email">
            <input
              id={`email-${id}`}
              name="email"
              type="email"
              required
              defaultValue={candidate.email}
              autoComplete="off"
              className={inputClass}
            />
          </Field>
          <p className="text-ink/70">The candidate will log in with the new email from now on.</p>
        </ActionPanel>
      )}

      {panel === "password" && (
        <ActionPanel
          id={id}
          action={updateCandidatePassword}
          submitLabel="Save password"
          onCancel={close}
          onDone={() => done("Password updated.")}
        >
          <Field id={`password-${id}`} label="New password">
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
          <p className="text-ink/70">At least 8 characters. Share it with the candidate securely.</p>
        </ActionPanel>
      )}

      {panel === "category" && (
        <ActionPanel
          id={id}
          action={updateCandidateCategory}
          submitLabel="Save category"
          onCancel={close}
          onDone={() => done("Category updated.")}
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
        </ActionPanel>
      )}

      {panel === "access" && (
        <ActionPanel
          id={id}
          action={updateCandidateAccess}
          submitLabel="Save access"
          onCancel={close}
          onDone={() => done("Access updated.")}
        >
          <p>Currently: {candidate.expiryLabel}</p>
          <AccessLengthField
            idPrefix={`access-${id}`}
            label="New access length"
            minDate={minDate}
            maxDate={maxDate}
          />
        </ActionPanel>
      )}

      {panel === "block" && (
        <ActionPanel
          id={id}
          action={setCandidateBlocked}
          submitLabel="Yes, block"
          danger
          onCancel={close}
          onDone={() => done("Candidate blocked.")}
        >
          <input type="hidden" name="blocked" value="true" />
          <p>
            Block <strong className="break-all">{candidate.email}</strong>? They won&apos;t be able
            to use the portal until you unblock them. Nothing is deleted.
          </p>
        </ActionPanel>
      )}

      {panel === "delete" && (
        <ActionPanel
          id={id}
          action={deleteCandidate}
          submitLabel="Yes, delete"
          danger
          onCancel={close}
          onDone={close}
        >
          <p>
            Delete <strong className="break-all">{candidate.email}</strong>? Their account and login
            history will be permanently removed. This can&apos;t be undone.
          </p>
          <p>To stop access temporarily instead, use Block.</p>
        </ActionPanel>
      )}
    </div>
  );
}

function ActionPanel({
  id,
  action,
  submitLabel,
  danger = false,
  onCancel,
  onDone,
  children,
}: {
  id: string;
  action: Action;
  submitLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onDone: () => void;
  children: ReactNode;
}) {
  const [state, formAction, isPending] = useActionState(
    async (prev: CandidateActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.success) onDone();
      return result;
    },
    initialState
  );

  return (
    <form
      action={formAction}
      className={
        danger
          ? "space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900"
          : "space-y-3 rounded-lg border border-ink/15 bg-ink/5 p-4"
      }
    >
      <input type="hidden" name="candidateId" value={id} />
      {children}
      {state.error && (
        <p role="alert" className={danger ? "font-medium" : "text-red-700"}>
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={isPending}
          className={danger ? dangerButtonClass : primaryButtonClass}
        >
          {isPending ? "Saving…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={isPending} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function UnblockButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [state, formAction, isPending] = useActionState(
    async (prev: CandidateActionState, formData: FormData) => {
      const result = await setCandidateBlocked(prev, formData);
      if (result.success) onDone();
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="candidateId" value={id} />
      <input type="hidden" name="blocked" value="false" />
      <button type="submit" disabled={isPending} className={`${secondaryButtonClass} w-full`}>
        {isPending ? "Unblocking…" : "Unblock"}
      </button>
      {state.error && (
        <p role="alert" className="text-red-700 sm:col-span-2">
          {state.error}
        </p>
      )}
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
