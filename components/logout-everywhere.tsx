"use client";

import { useState } from "react";
import { NOT_THROUGH_MESSAGE } from "@/lib/forms";
import { useConfirmFocus } from "@/components/candidate/use-confirm-focus";
import { logOut } from "./logout-button";

export type LogoutEverywhereStyles = { button: string; yes: string; cancel: string; box: string; heading: string; text: string; error: string };

// "Log out of all devices", with a confirmation on the page. Ordinary Log out still ends only this browser's sign-in.
export function LogoutEverywhere({ styles }: { styles: LogoutEverywhereStyles }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const { heading, opener } = useConfirmFocus(open);

  async function confirm() {
    setBusy(true);
    setFailed(false);
    try {
      await logOut(true);
    } catch {
      setBusy(false);
      setFailed(true);
    }
  }

  if (!open) {
    return (
      <button ref={opener} type="button" onClick={() => setOpen(true)} className={styles.button}>
        Log out of all devices
      </button>
    );
  }
  return (
    <div role="group" aria-labelledby="logout-everywhere-heading" className={styles.box}>
      <h3 id="logout-everywhere-heading" ref={heading} tabIndex={-1} className={styles.heading}>
        Log out of all devices?
      </h3>
      <p className={styles.text}>You’ll need to log in again on every phone, tablet and computer, including this one.</p>
      {failed && (
        <p role="alert" className={styles.error}>
          {NOT_THROUGH_MESSAGE}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={confirm} disabled={busy} aria-busy={busy || undefined} className={styles.yes}>
          {busy ? "Logging out…" : "Yes, log out everywhere"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className={styles.cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
