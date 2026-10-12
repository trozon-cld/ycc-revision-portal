"use client";

import { useState } from "react";

const DEFAULT_CLASS =
  "rounded-lg border border-ink/25 px-5 py-3 text-base font-medium text-ink hover:bg-ink/5 disabled:opacity-60";

export function LogoutButton({ className = DEFAULT_CLASS }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error(`Logout failed (${response.status})`);
      window.location.href = "/login";
    } catch {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={handleLogout} disabled={busy} aria-busy={busy || undefined} className={className}>
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}
