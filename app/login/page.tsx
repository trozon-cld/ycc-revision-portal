"use client";

import { useState, type FormEvent } from "react";
import { useBrowserValue } from "@/components/use-browser-value";
import { CARD, ERROR_BOX, NOTE_BOX, PRIMARY_BUTTON } from "@/components/candidate/buttons";
import { NOT_THROUGH_MESSAGE } from "@/lib/forms";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Sent here because a sign-in ended (time limit, password changed elsewhere, or a page opened signed out).
  const ended = useBrowserValue(() => new URLSearchParams(window.location.search).has("ended"), false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setIsSubmitting(false);
        return;
      }

      // Full navigation so Proxy sees the cookie the browser just stored.
      window.location.href = data.redirectTo;
    } catch {
      setError(NOT_THROUGH_MESSAGE);
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-page p-4">
      <form
        onSubmit={handleSubmit}
        className={`${CARD} w-full max-w-sm space-y-5 p-6 sm:p-8`}
      >
        <div>
          <h1 className="text-3xl font-bold text-ink">Log in</h1>
          <p className="mt-1 text-base text-muted">YCC Revision Portal</p>
        </div>

        {ended && (
          <p role="status" className={`${NOTE_BOX} p-4 text-lg leading-relaxed text-ink`}>
            You were logged out to keep your account safe. Log in again to carry on.
          </p>
        )}

        <div className="space-y-2">
          <label
            htmlFor="email"
            className="block text-base font-medium text-ink"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-12 w-full rounded-xl border-2 border-ink/50 bg-card px-4 py-2 text-base text-ink focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/30"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="password"
            className="block text-base font-medium text-ink"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-12 w-full rounded-xl border-2 border-ink/50 bg-card px-4 py-2 text-base text-ink focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/30"
          />
        </div>

        {error && (
          <p role="alert" className={ERROR_BOX}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className={`${PRIMARY_BUTTON} w-full`}
        >
          {isSubmitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
