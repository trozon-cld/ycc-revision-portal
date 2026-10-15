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
        className={`flex size-12 shrink-0 items-center justify-center rounded-xl sm:size-14 ${href ? "bg-primary text-white" : "bg-ink/5 text-muted"}`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-lg font-bold text-ink sm:text-xl">{title}</span>
        <span className="text-base leading-snug text-muted">{description}</span>
        {!href && (
          <span className="mt-2 self-start rounded-full bg-ink/10 px-3 py-1 text-sm font-semibold text-ink">
            Coming soon
          </span>
        )}
      </span>
      {href && (
        <span aria-hidden="true" className="hidden self-center text-3xl leading-none text-primary sm:block">
          ›
        </span>
      )}
    </>
  );

  // Phones: a tile with the icon on top (two per row); from 640px: icon, text and arrow in a row.
  const shared = "flex h-full flex-col gap-3 rounded-2xl border-2 bg-card p-4 sm:min-h-28 sm:flex-row sm:items-start sm:gap-4 sm:p-5";
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
