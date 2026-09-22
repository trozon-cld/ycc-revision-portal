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
      className="rounded-lg border border-gray-300 px-5 py-3 text-base font-medium text-gray-900 hover:bg-gray-50"
    >
      Log out
    </button>
  );
}
