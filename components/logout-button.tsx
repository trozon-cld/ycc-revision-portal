"use client";

export function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-lg border border-ink/25 px-5 py-3 text-base font-medium text-ink hover:bg-ink/5"
    >
      Log out
    </button>
  );
}
