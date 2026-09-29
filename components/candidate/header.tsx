"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { LOGO } from "@/lib/brand";

const NAV_BUTTON =
  "inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-ink/25 bg-white px-4 text-base font-semibold text-ink hover:border-primary hover:text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary";

// Pages whose content puts these items in its own bar on laptops and desktops (the Handbook).
const OWN_BAR_PATHS = ["/dashboard/prepare"];

export function HomeLogo({ showName = true }: { showName?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className="flex min-h-12 items-center gap-2 rounded-lg text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Image src={LOGO.src} width={LOGO.width} height={LOGO.height} alt="YCC" unoptimized className="h-10 w-auto" />
      {showName ? (
        <>
          <span className="hidden text-lg font-semibold min-[420px]:inline">Revision Portal</span>
          <span className="sr-only min-[420px]:hidden">Revision Portal, home</span>
        </>
      ) : (
        <span className="sr-only">Revision Portal, home</span>
      )}
    </Link>
  );
}

export function AccountLinks({ buttonClass = NAV_BUTTON }: { buttonClass?: string }) {
  return (
    <>
      <Link href="/dashboard/help" className={buttonClass}>
        Help
      </Link>
      <LogoutButton className={buttonClass} />
    </>
  );
}

// Candidate pages: logo, Help and Log out, large and simple.
export function CandidateHeader() {
  const pathname = usePathname();
  const ownBar = OWN_BAR_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  return (
    <header className={`h-(--candidate-header) shrink-0 border-b border-ink/15 bg-white ${ownBar ? "lg:hidden" : ""}`}>
      <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-between gap-3 px-4">
        <HomeLogo />
        <nav aria-label="Account" className="flex items-center gap-2">
          <AccountLinks />
        </nav>
      </div>
    </header>
  );
}
