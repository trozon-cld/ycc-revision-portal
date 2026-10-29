import Link from "next/link";

// Links styled as tabs between pages that share one heading (e.g. Languages: Pages / Languages).
export function PageTabs({ label, tabs, current }: { label: string; tabs: { href: string; label: string }[]; current: string }) {
  return (
    <nav aria-label={label} className="-mt-2 mb-5 border-b border-slate-200">
      <ul className="flex gap-1">
        {tabs.map((tab) => {
          const isCurrent = tab.href === current;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={isCurrent ? "page" : undefined}
                className={`-mb-px inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  isCurrent ? "border-primary text-ink" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
