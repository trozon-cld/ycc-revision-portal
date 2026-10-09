"use client";

import Form from "next/form";
import { Fragment, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";

// Opens the filtered list without a full page reload. Rebuilt for each new query, so after Clear or
// Back the boxes show the filters actually in use.
export function FilterForm({ action, className, children }: { action: string; className: string; children: ReactNode }) {
  const query = useSearchParams().toString();
  return (
    <Fragment key={query}>
      <Form action={action} className={className}>
        {children}
      </Form>
    </Fragment>
  );
}

// Apply, showing "Applying…" until the filtered list arrives.
export function FilterApplyButton({ className }: { className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Applying…" : "Apply"}
    </button>
  );
}
