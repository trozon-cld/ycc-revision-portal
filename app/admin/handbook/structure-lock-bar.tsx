"use client";

import { ActionForm } from "@/components/admin/action-form";
import { ActionButton, type PanelRowAction } from "@/components/admin/row-actions";
import { Icon } from "@/components/icons";
import type { StructureLockView } from "@/lib/handbook/structure-lock";
import { setStructureLock } from "./structure-lock-actions";

// The Handbook and Test types pages: whether sections, chapters and chapter links can change, with Lock / Unlock.
export function StructureLockBar({ lock }: { lock: StructureLockView }) {
  const action: PanelRowAction = lock.locked
    ? {
        label: "Unlock",
        title: "Unlock the structure?",
        variant: "confirm",
        render: (close) => (
          <ActionForm
            action={setStructureLock}
            hidden={{ locked: "false" }}
            submitLabel="Unlock"
            pendingLabel="Unlocking…"
            successMessage="Structure unlocked."
            onSuccess={close}
            onCancel={close}
          >
            <p className="text-sm">
              Sections, chapters and which chapters each test type has can then be changed, and chapters unpublished.
              These changes reach candidates straight away. Lock it again when you&apos;re done.
            </p>
          </ActionForm>
        ),
      }
    : {
        label: "Lock structure",
        title: "Lock the structure?",
        variant: "confirm",
        render: (close) => (
          <ActionForm
            action={setStructureLock}
            hidden={{ locked: "true" }}
            submitLabel="Lock"
            pendingLabel="Locking…"
            successMessage="Structure locked."
            onSuccess={close}
            onCancel={close}
          >
            <p className="text-sm">
              Sections, chapters and which chapters each test type has can&apos;t be changed until it&apos;s unlocked, and
              chapters can&apos;t be unpublished. Pages, questions and publishing work as usual.
            </p>
          </ActionForm>
        ),
      };

  return (
    <section
      aria-label="Structure lock"
      className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 ring-1 ${
        lock.locked ? "bg-white ring-slate-200" : "bg-warn-bg ring-warn/25"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon name={lock.locked ? "locked" : "unlocked"} size={20} weight={lock.locked ? "fill" : "regular"} className={`mt-0.5 ${lock.locked ? "text-primary" : "text-warn-strong"}`} />
        <div className="min-w-0 text-sm">
          <p className={`font-semibold ${lock.locked ? "text-ink" : "text-warn-strong"}`}>{lock.locked ? "Structure locked" : "Structure unlocked"}</p>
          <p className={lock.locked ? "text-slate-600" : "text-warn-strong"}>
            {lock.locked
              ? "Sections, chapters and which chapters each test type has can't be changed."
              : "Sections, chapters and which chapters each test type has can be changed. Lock it so nothing moves by accident."}
            {lock.changed && ` ${lock.changed}`}
          </p>
        </div>
      </div>
      <ActionButton action={action} variant={lock.locked ? "secondary" : "primary"} />
    </section>
  );
}
