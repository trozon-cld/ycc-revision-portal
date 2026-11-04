import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ListBackLink } from "./list-place";

// `list`: the link returns to that list with its filters and page; `current`: this page (shown, not linked).
export type Crumb = { label: ReactNode; href?: string; list?: string; current?: boolean };

const LINK = "text-primary underline underline-offset-2 hover:text-ink";

// The trail above a staff page's heading: "Handbook / 01 General responsibilities".
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 text-sm">
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <span aria-hidden="true" className="mx-1.5 text-slate-500">
              /
            </span>
          )}
          {item.href && item.list ? (
            <ListBackLink list={item.list} href={item.href} className={LINK}>
              {item.label}
            </ListBackLink>
          ) : item.href ? (
            <Link href={item.href} className={LINK}>
              {item.label}
            </Link>
          ) : (
            <span aria-current={item.current ? "page" : undefined} className="text-slate-700">
              {item.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
