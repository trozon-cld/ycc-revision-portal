import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { BAR_FILL, BAR_TRACK, CARD, SECTION_TITLE } from "@/components/candidate/buttons";

// A section that opens and closes (the browser's own details/summary: keyboard and screen readers work without script).
// Closed it still shows the title, a one-line summary and, if given, a bar (share 0–1).
export function Accordion({
  id,
  title,
  summary,
  share,
  open = false,
  nested = false,
  children,
}: {
  id: string;
  title: string;
  summary?: ReactNode;
  share?: number;
  open?: boolean;
  // Inside another section: no card of its own, a line above instead.
  nested?: boolean;
  children: ReactNode;
}) {
  const box = (
    <details id={id} open={open} className={nested ? "group/inner border-t-2 border-line-soft" : `group/outer ${CARD}`}>
      <summary
        className={`flex min-h-14 cursor-pointer list-none items-start gap-3 rounded-2xl focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden ${
          nested ? "py-3" : "p-4 lg:p-5"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span id={`${id}-title`} className={`block ${nested ? "text-lg font-bold text-ink" : SECTION_TITLE}`}>
            {title}
          </span>
          {summary && <span className="mt-1 block text-base text-muted [overflow-wrap:anywhere]">{summary}</span>}
          {share !== undefined && (
            <span aria-hidden="true" className={`${BAR_TRACK} mt-3 block h-3.5`}>
              <span className={`${BAR_FILL} block`} style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }} />
            </span>
          )}
        </span>
        <Icon
          name="expand"
          className={`mt-1 text-primary transition-transform motion-reduce:transition-none ${nested ? "group-open/inner:rotate-180" : "group-open/outer:rotate-180"}`}
        />
      </summary>
      <div className={nested ? "pb-3" : "px-4 pb-4 lg:px-5 lg:pb-5"}>{children}</div>
    </details>
  );
  // A top-level accordion is a named region, so screen-reader users can still jump between sections.
  return nested ? box : <section aria-labelledby={`${id}-title`}>{box}</section>;
}
