"use client";

import { startTransition, useActionState, useRef, type FormEvent, type ReactNode } from "react";
import { NOT_THROUGH_MESSAGE, reachServer, type FormState } from "@/lib/forms";
import { buttonClass, type ButtonVariant } from "./styles";
import { useToast } from "./toast";

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
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = (await reachServer(() => action(prev, formData))) ?? { error: NOT_THROUGH_MESSAGE };
    if (result.success) {
      formRef.current?.reset();
      if (successMessage) toast(successMessage);
      onSuccess?.();
    }
    return result;
  }, initialState);

  // Submitted by hand: React's own form action clears every field afterwards, even when there's an
  // error to fix. Here fields clear only on success.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(data));
  }

  const isPanel = layout === "panel";

  return (
    // POST, so a submit before the page is ready never puts fields (e.g. passwords) in the address.
    <form ref={formRef} method="post" onSubmit={onSubmit} className={isPanel ? "flex h-full flex-col" : "space-y-4"}>
      {hidden &&
        Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <div className={isPanel ? "flex-1 space-y-4 px-5 py-4" : "space-y-4"}>
        {children}
        {state.error && (
          <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-strong">
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
