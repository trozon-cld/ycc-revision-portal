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
        className={`flex size-14 shrink-0 items-center justify-center rounded-xl ${href ? "bg-primary text-white" : "bg-ink/5 text-muted"}`}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xl font-bold text-ink">{title}</span>
        <span className="text-base leading-snug text-muted">{description}</span>
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

  const shared = "flex h-full min-h-28 items-start gap-4 rounded-xl border-2 bg-card p-5";
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

export const SectionIcons = {
  help: <Icon name="help" size={30} />,
  book: <Icon name="book" size={30} />,
  practice: <Icon name="practice" size={30} />,
  timer: <Icon name="timer" size={30} />,
  progress: <Icon name="progress" size={30} />,
};
