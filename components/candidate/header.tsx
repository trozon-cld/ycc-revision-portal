import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";

const NAV_BUTTON =
  "inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-ink/25 bg-white px-4 text-base font-semibold text-ink hover:border-primary hover:text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary";

// Candidate pages only: logo, Help and Log out, large and simple.
export function CandidateHeader() {
  return (
    <header className="border-b border-ink/15 bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/dashboard"
          className="flex min-h-12 items-center gap-2 rounded-lg text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="rounded-md bg-primary px-2 py-1 text-lg font-bold tracking-wide text-white">YCC</span>
          <span className="hidden text-lg font-semibold min-[420px]:inline">Revision Portal</span>
          <span className="sr-only min-[420px]:hidden">Revision Portal, home</span>
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link href="/dashboard/help" className={NAV_BUTTON}>
            Help
          </Link>
          <LogoutButton className={NAV_BUTTON} />
        </nav>
      </div>
    </header>
  );
}
