"use client";

const DEFAULT_CLASS =
  "rounded-lg border border-ink/25 px-5 py-3 text-base font-medium text-ink hover:bg-ink/5";

export function LogoutButton({ className = DEFAULT_CLASS }: { className?: string }) {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <button type="button" onClick={handleLogout} className={className}>
      Log out
    </button>
  );
}
