"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { Dialog } from "./dialog";
import { RowMenu } from "./row-menu";
import { buttonClass } from "./styles";
import { useToast } from "./toast";

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
  run: () => Promise<{ error?: string; success?: boolean }>;
  successMessage: string;
};

export type RowAction = PanelRowAction | InstantRowAction;

// A row's "⋯" menu; each item opens its own slide-in panel or confirmation, or runs instantly.
export function RowActions({ label, actions }: { label: string; actions: RowAction[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = activeIndex === null ? null : actions[activeIndex];
  const active = selected && "render" in selected ? selected : null;

  function runInstant(action: InstantRowAction) {
    startTransition(async () => {
      const result = await action.run();
      toast(result.error ?? action.successMessage);
      triggerRef.current?.focus();
    });
  }

  function close() {
    setActiveIndex(null);
    // Wait for the dialog to unmount; focus can't leave an open modal.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <>
      <RowMenu
        label={label}
        triggerRef={triggerRef}
        items={actions.map((action, index) => ({
          label: action.label,
          danger: action.danger,
          onSelect: () => ("run" in action ? runInstant(action) : setActiveIndex(index)),
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

// Page-level "+ New …" button that opens a slide-in panel.
export function PanelButton({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    // Wait for the dialog to unmount; focus can't leave an open modal.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass("primary")}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4">
          <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
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
