"use client";

import { useState } from "react";

const DEFAULT_CLASS =
  "rounded-lg border border-ink/25 px-5 py-3 text-base font-medium text-ink hover:bg-ink/5 disabled:opacity-60";

// Signs out and opens the login page; throws if the server didn't sign out. `everywhere` ends every device's sign-in.
export async function logOut(everywhere = false) {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(everywhere ? { everywhere: true } : {}),
  });
  if (!response.ok) throw new Error(`Logout failed (${response.status})`);
  window.location.href = "/login";
}

export function LogoutButton({ className = DEFAULT_CLASS }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await logOut();
    } catch {
      setBusy(false);
    }
  }

  return (
    <button type="button" data-logout="" onClick={handleLogout} disabled={busy} aria-busy={busy || undefined} className={className}>
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}
