import Link from "next/link";
import type { ReactNode } from "react";

// A home-screen section. Without an href it isn't built yet: shown, but not a link.
export function SectionCard({
  title,
  description,
  icon,
  href,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className={`flex size-14 shrink-0 items-center justify-center rounded-xl ${href ? "bg-primary text-white" : "bg-ink/5 text-ink/70"}`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xl font-bold text-ink">{title}</span>
        <span className="text-base leading-snug text-ink/80">{description}</span>
        {!href && (
          <span className="mt-2 self-start rounded-full bg-ink/10 px-3 py-1 text-sm font-semibold text-ink">
            Coming soon
          </span>
        )}
      </span>
      {href && (
        <span aria-hidden="true" className="self-center text-3xl leading-none text-primary">
          ›
        </span>
      )}
    </>
  );

  const shared = "flex h-full min-h-28 items-start gap-4 rounded-xl border-2 bg-white p-5";
  if (!href) {
    return <div className={`${shared} border-ink/15`}>{body}</div>;
  }
  return (
    <Link
      href={href}
      className={`${shared} border-ink/20 hover:border-primary hover:bg-primary/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary`}
    >
      {body}
    </Link>
  );
}

const ICON = {
  width: 30,
  height: 30,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const SectionIcons = {
  help: (
    <svg {...ICON}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
      <path d="M12 17.5h.01" />
    </svg>
  ),
  book: (
    <svg {...ICON}>
      <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H3z" />
      <path d="M21 5.5A1.5 1.5 0 0 0 19.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z" />
    </svg>
  ),
  practice: (
    <svg {...ICON}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  ),
  timer: (
    <svg {...ICON}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5" />
      <path d="M9.5 2h5" />
    </svg>
  ),
  progress: (
    <svg {...ICON}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </svg>
  ),
};
