"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { BAR_SHADOW_BOTTOM } from "@/components/candidate/buttons";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/dashboard/prepare", label: "Prepare", icon: "book" },
  { href: "/dashboard/practice", label: "Practice", icon: "practice" },
  { href: "/dashboard/mock", label: "Mock test", icon: "timer" },
  { href: "/dashboard/progress", label: "Progress", icon: "progress" },
];

// Phones and tablets: the main sections along the bottom. Hidden on laptops and in the focused modes (globals.css).
export function CandidateTabBar() {
  const pathname = usePathname();
  return (
    <>
      {/* Keeps the end of the page clear of the fixed bar. */}
      <div aria-hidden="true" className="candidate-tabs h-[calc(var(--candidate-tabs)+env(safe-area-inset-bottom))] shrink-0 lg:hidden" />
      <nav
        aria-label="Main"
        className={`candidate-tabs fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] lg:hidden ${BAR_SHADOW_BOTTOM}`}
      >
        <ul className="mx-auto grid h-(--candidate-tabs) max-w-3xl grid-cols-5">
          {TABS.map((tab) => {
            const current = pathname === tab.href;
            return (
              <li key={tab.href} className="min-w-0">
                <Link
                  href={tab.href}
                  aria-current={current ? "page" : undefined}
                  className={`relative flex h-full flex-col items-center justify-center gap-0.5 px-0.5 text-center text-sm leading-tight font-semibold focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-primary ${
                    current ? "text-primary" : "text-muted hover:text-ink"
                  }`}
                >
                  {current && <span aria-hidden="true" className="hc-fill absolute inset-x-3 top-0 h-1 rounded-b-full bg-primary" />}
                  <Icon name={tab.icon} weight={current ? "fill" : "bold"} />
                  <span className="max-w-full">{tab.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
