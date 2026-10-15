"use client";

import { Icon } from "@/components/icons";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { buttonClass } from "./styles";

export type RowMenuItem = { label: string; danger?: boolean; onSelect: () => void };

const ITEM_HEIGHT_PX = 40;

export function RowMenu({
  label,
  items,
  triggerRef,
  triggerText,
  busy = false,
}: {
  label: string;
  items: RowMenuItem[];
  triggerRef: RefObject<HTMLButtonElement | null>;
  // A visible word ("Actions") instead of "⋯", for a page header.
  triggerText?: string;
  // An item is still running: a spinner shows and the menu stays shut (focus stays on the button).
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function toggle() {
    if (busy) return;
    if (!open && triggerRef.current) {
      const spaceBelow = window.innerHeight - triggerRef.current.getBoundingClientRect().bottom;
      setOpenUp(spaceBelow < items.length * ITEM_HEIGHT_PX + 16);
    }
    setOpen((value) => !value);
  }

  function closeAndRefocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRefocus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-disabled={busy || undefined}
        className={`${triggerText ? buttonClass("secondary") : buttonClass("ghost", "icon")} aria-disabled:cursor-progress aria-disabled:opacity-60`}
      >
        {busy ? (
          <>
            {triggerText}
            <Spinner />
          </>
        ) : triggerText ? (
          <>
            {triggerText}
            <Icon name="expand" size={16} weight="regular" />
          </>
        ) : (
          <Icon name="more" size={20} weight="bold" />
        )}
      </button>
      <span role="status" className="sr-only">
        {busy ? "Working…" : ""}
      </span>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={`absolute right-0 z-30 w-52 rounded-md border border-slate-200 bg-white p-1 shadow-lg ${
            openUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex h-10 w-full items-center rounded px-3 text-left text-sm focus:outline-none sm:h-9 ${
                item.danger
                  ? "text-danger hover:bg-danger-bg focus:bg-danger-bg"
                  : "text-ink hover:bg-slate-100 focus:bg-slate-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4 motion-safe:animate-spin">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M10 3a7 7 0 0 1 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
