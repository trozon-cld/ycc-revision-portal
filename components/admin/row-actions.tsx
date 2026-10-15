"use client";

import { Icon } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { NOT_THROUGH_MESSAGE, reachServer, type FormState } from "@/lib/forms";
import { Dialog } from "./dialog";
import { RowMenu } from "./row-menu";
import { buttonClass, type ButtonVariant } from "./styles";
import { useToast } from "./toast";

// The button that opened a dialog gets focus back once the dialog has closed (focus can't leave an open modal).
function useFocusAfterClose(open: boolean) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) requestAnimationFrame(() => triggerRef.current?.focus());
    wasOpen.current = open;
  }, [open]);
  return triggerRef;
}

export type PanelRowAction = {
  label: string;
  danger?: boolean;
  title: string;
  description?: ReactNode;
  variant?: "panel" | "confirm";
  render: (close: () => void) => ReactNode;
};

// Runs straight away (no panel), then toasts the result. For quick, reversible actions.
export type InstantRowAction = {
  label: string;
  danger?: boolean;
  run: () => Promise<FormState>;
  successMessage?: string;
  // Shown on a page-level button while it runs (e.g. "Publishing…").
  pendingLabel?: string;
};

// Opens another page (e.g. a candidate's progress).
export type LinkRowAction = { label: string; danger?: never; href: string };

export type RowAction = PanelRowAction | InstantRowAction | LinkRowAction;

// A row's "⋯" menu; each item opens its own slide-in panel or confirmation, runs instantly, or opens a page.
export function RowActions({ label, actions, triggerText }: { label: string; actions: RowAction[]; triggerText?: string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const triggerRef = useFocusAfterClose(activeIndex !== null);
  const selected = activeIndex === null ? null : actions[activeIndex];
  const active = selected && "render" in selected ? selected : null;

  function runInstant(action: InstantRowAction) {
    startTransition(async () => {
      const result = (await reachServer(action.run)) ?? { error: NOT_THROUGH_MESSAGE };
      const message = result.error ?? action.successMessage;
      if (message) toast(message);
      triggerRef.current?.focus();
    });
  }

  function close() {
    setActiveIndex(null);
  }

  return (
    <>
      <RowMenu
        label={label}
        triggerRef={triggerRef}
        triggerText={triggerText}
        busy={isPending}
        items={actions.map((action, index) => ({
          label: action.label,
          danger: action.danger,
          onSelect: () => ("href" in action ? router.push(action.href) : "run" in action ? runInstant(action) : setActiveIndex(index)),
        }))}
      />
      {active && (
        <Dialog
          title={active.title}
          description={active.description}
          variant={active.variant}
          onClose={close}
        >
          {active.render(close)}
        </Dialog>
      )}
    </>
  );
}

// One row action as a page-level button (e.g. Publish on a chapter's own page): same panel or instant run as in the menu.
export function ActionButton({ action, variant = "secondary" }: { action: PanelRowAction | InstantRowAction; variant?: ButtonVariant }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();
  const triggerRef = useFocusAfterClose(open);

  function close() {
    setOpen(false);
  }

  function onClick() {
    if ("render" in action) return setOpen(true);
    startTransition(async () => {
      const result = (await reachServer(action.run)) ?? { error: NOT_THROUGH_MESSAGE };
      const message = result.error ?? action.successMessage;
      if (message) toast(message);
    });
  }

  return (
    <>
      <button ref={triggerRef} type="button" onClick={onClick} disabled={isPending} className={buttonClass(variant)}>
        {isPending && "pendingLabel" in action && action.pendingLabel ? action.pendingLabel : action.label}
      </button>
      {open && "render" in action && (
        <Dialog title={action.title} description={action.description} variant={action.variant} onClose={close}>
          {action.render(close)}
        </Dialog>
      )}
    </>
  );
}

// Page-level "+ New …" button that opens a slide-in panel.
export function PanelButton({
  label,
  title,
  variant = "primary",
  icon = true,
  children,
}: {
  label: string;
  title: string;
  variant?: ButtonVariant;
  // The "+" icon, for buttons that add something.
  icon?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useFocusAfterClose(open);

  function close() {
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass(variant)}
      >
        {icon && (
          <Icon name="add" size={16} weight="regular" />
        )}
        {label}
      </button>
      {open && (
        <Dialog title={title} onClose={close}>
          {children(close)}
        </Dialog>
      )}
    </>
  );
}
