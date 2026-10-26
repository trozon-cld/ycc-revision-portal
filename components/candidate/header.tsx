"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { LOGO } from "@/lib/brand";
import { Icon, type IconName } from "@/components/icons";
import { BAR_SHADOW_TOP } from "@/components/candidate/buttons";

const NAV_BUTTON =
  "inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-ink/25 bg-card px-4 text-base font-semibold text-ink hover:border-primary hover:text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary";

// Pages whose content puts these items in its own bar on laptops and desktops (the Handbook).
const OWN_BAR_PATHS = ["/dashboard/prepare"];

export function HomeLogo({ showName = true }: { showName?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className="flex min-h-12 items-center gap-2 rounded-lg text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Image src={LOGO.src} width={LOGO.width} height={LOGO.height} alt="YCC" unoptimized loading="eager" className="h-8 w-auto max-w-[157px] object-contain object-left" />
      {showName ? (
        <>
          <span className="hidden text-base font-semibold min-[420px]:inline">Revision Portal</span>
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

// Top bar buttons: icon and word (word hidden below 360px; the name stays for screen readers).
const TOP_BUTTON_LOOK =
  "min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2.5 text-base font-semibold text-ink hover:bg-fill aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary";
const TOP_BUTTON = `inline-flex ${TOP_BUTTON_LOOK}`;

function TopLink({ href, icon, label, pathname }: { href: string; icon: IconName; label: string; pathname: string }) {
  const current = pathname === href;
  return (
    <Link href={href} aria-current={current ? "page" : undefined} className={TOP_BUTTON}>
      <Icon name={icon} weight={current ? "fill" : "bold"} />
      <span className="max-[359px]:sr-only">{label}</span>
    </Link>
  );
}

// Candidate pages: a slim bar with the logo (Home), Help and Account; Log out too on laptops (no tab bar there).
export function CandidateHeader() {
  const pathname = usePathname();
  const ownBar = OWN_BAR_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  return (
    <header className={`candidate-header h-(--candidate-header) shrink-0 border-b border-line bg-card ${BAR_SHADOW_TOP} ${ownBar ? "lg:hidden" : ""}`}>
      <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-between gap-2 px-3 sm:px-4">
        <Link
          href="/dashboard"
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {/* Room for a wide logo (about 5:1, up to 157 x 32). */}
          <Image src={LOGO.src} width={LOGO.width} height={LOGO.height} alt="YCC" unoptimized loading="eager" className="h-8 w-auto max-w-[157px] object-contain object-left" />
          <span className="hidden text-base font-semibold lg:inline">Revision Portal</span>
          <span className="sr-only lg:hidden">Revision Portal, home</span>
        </Link>
        <nav aria-label="Help and account" className="flex items-center gap-1">
          <TopLink href="/dashboard/help" icon="help" label="Help" pathname={pathname} />
          <TopLink href="/dashboard/account" icon="person" label="Account" pathname={pathname} />
          <LogoutButton className={`hidden lg:inline-flex ${TOP_BUTTON_LOOK}`} />
        </nav>
      </div>
    </header>
  );
}
