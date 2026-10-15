import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";

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
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl sm:row-span-2 sm:size-14 ${href ? "bg-primary text-white" : "bg-ink/5 text-muted"}`}
      >
        {icon}
      </span>
      <span className="min-w-0 text-lg font-bold text-ink [overflow-wrap:anywhere] sm:text-xl">{title}</span>
      <span className="col-span-2 text-base leading-snug text-muted max-[359px]:col-span-1 sm:col-span-1 sm:col-start-2">{description}</span>
      {!href && (
        <span className="col-span-2 self-start justify-self-start max-[359px]:col-span-1 rounded-full bg-ink/10 px-3 py-1 text-sm font-semibold text-ink sm:col-span-1 sm:col-start-2">
          Coming soon
        </span>
      )}
      {href && (
        <span aria-hidden="true" className="hidden self-center text-3xl leading-none text-primary sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:block">
          ›
        </span>
      )}
    </>
  );

  // Phones: icon beside the title (above it under 360px), the description below, two tiles per row; from 640px: one row with an arrow.
  const shared =
    "grid h-full grid-cols-[auto_minmax(0,1fr)] content-start items-center gap-x-3 gap-y-2 rounded-2xl border-2 bg-card p-4 max-[359px]:grid-cols-1 sm:min-h-28 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:gap-x-4 sm:gap-y-1 sm:p-5";
  if (!href) {
    return <div className={`${shared} border-line-soft`}>{body}</div>;
  }
  return (
    <Link
      href={href}
      className={`${shared} border-line hover:border-primary hover:bg-primary/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary`}
    >
      {body}
    </Link>
  );
}

export const SectionIcons = {
  help: <Icon name="help" size={30} />,
  book: <Icon name="book" size={30} />,
  practice: <Icon name="practice" size={30} />,
  timer: <Icon name="timer" size={30} />,
  progress: <Icon name="progress" size={30} />,
};
