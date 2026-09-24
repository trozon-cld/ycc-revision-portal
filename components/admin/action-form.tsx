"use client";

import { useActionState, type ReactNode } from "react";
import { buttonClass, type ButtonVariant } from "./styles";
import { useToast } from "./toast";

export type FormState = { error?: string; success?: boolean };
export type FormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

const initialState: FormState = {};

// Wraps a server action: shows its error inline, and on success toasts and calls onSuccess.
export function ActionForm({
  action,
  hidden,
  submitLabel,
  pendingLabel = "Saving…",
  variant = "primary",
  successMessage,
  onSuccess,
  onCancel,
  layout = "panel",
  children,
}: {
  action: FormAction;
  hidden?: Record<string, string>;
  submitLabel: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  successMessage?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  layout?: "panel" | "inline";
  children?: ReactNode;
}) {
  const toast = useToast();
  const [state, formAction, isPending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.success) {
      if (successMessage) toast(successMessage);
      onSuccess?.();
    }
    return result;
  }, initialState);

  const isPanel = layout === "panel";

  return (
    <form action={formAction} className={isPanel ? "flex h-full flex-col" : "space-y-4"}>
      {hidden &&
        Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <div className={isPanel ? "flex-1 space-y-4 px-5 py-4" : "space-y-4"}>
        {children}
        {state.error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {state.error}
          </p>
        )}
      </div>
      <div
        className={
          isPanel
            ? "sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3"
            : "flex gap-2"
        }
      >
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={isPending} className={buttonClass("secondary")}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={isPending} className={buttonClass(variant)}>
          {isPending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
