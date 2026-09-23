import { requireRole } from "@/lib/auth/guard";
import { LogoutButton } from "@/components/logout-button";

// Placeholder landing page — proves Candidate login + role gating works.
// Prepare/Practice/Mock Test sections come later.
export default async function CandidateDashboard() {
  const session = await requireRole(["candidate"]);

  const expiryLabel = session.accessExpiresAt
    ? new Date(session.accessExpiresAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold text-ink">
        Welcome, {session.email}
      </h1>

      {expiryLabel && (
        <div className="w-full max-w-md rounded-lg border border-amber-300 bg-amber-50 p-4 text-base text-amber-900">
          Your revision access is active until {expiryLabel}. Please complete
          your study and mock tests before this date.
        </div>
      )}

      <p className="max-w-sm text-base text-ink/70">
        This is a placeholder — Prepare, Practice, and Mock Test sections
        come later.
      </p>
      <LogoutButton />
    </div>
  );
}
