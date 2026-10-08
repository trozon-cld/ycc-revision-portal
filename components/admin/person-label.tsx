import Link from "next/link";
import { Breakable } from "./breakable";

// Name above email in admin tables; people created before names existed show "No name yet".
// With `href` the name links to that person's page.
export function PersonLabel({ name, email, href }: { name: string | null; email: string; href?: string }) {
  const label = <span className={`block ${name ? "" : "font-normal italic text-slate-600"}`}>{name ?? "No name yet"}</span>;
  return (
    <span className="block min-w-0">
      {href ? (
        <Link href={href} className="block rounded-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          {label}
        </Link>
      ) : (
        label
      )}
      <span className="block text-xs font-normal text-slate-600">
        <Breakable text={email} />
      </span>
    </span>
  );
}
