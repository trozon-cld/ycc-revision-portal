import Image from "next/image";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";

const NAV_BUTTON =
  "inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-ink/25 bg-white px-4 text-base font-semibold text-ink hover:border-primary hover:text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary";

// Placeholder until the real logo file is added to public/; change src, width and height here.
const LOGO = { src: "/ycc-logo-placeholder.svg", width: 120, height: 48 };

// Candidate pages only: logo, Help and Log out, large and simple.
export function CandidateHeader() {
  return (
    <header className="border-b border-ink/15 bg-white">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/dashboard"
          className="flex min-h-12 items-center gap-2 rounded-lg text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Image src={LOGO.src} width={LOGO.width} height={LOGO.height} alt="YCC" unoptimized className="h-10 w-auto" />
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
