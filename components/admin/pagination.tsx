import Link from "next/link";
import { buttonClass } from "./styles";

// Previous / Next links for long admin lists. Keeps the page's other filters in the address.
// With `total` it also says which rows show ("51–100 of 7,000").
export function Pagination({
  basePath,
  page,
  hasMore,
  query,
  total,
  pageSize,
}: {
  basePath: string;
  page: number;
  hasMore: boolean;
  query: Record<string, string>;
  total?: number;
  pageSize?: number;
}) {
  if (page === 1 && !hasMore) return null;

  const hrefFor = (target: number) => {
    const search = new URLSearchParams(
      Object.entries({ ...query, page: target === 1 ? "" : String(target) }).filter(([, value]) => value !== "")
    ).toString();
    return search ? `${basePath}?${search}` : basePath;
  };
  const range =
    total !== undefined && pageSize
      ? `${((page - 1) * pageSize + 1).toLocaleString("en-GB")}–${Math.min(page * pageSize, total).toLocaleString("en-GB")} of ${total.toLocaleString("en-GB")}`
      : null;

  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-2">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={buttonClass("secondary", "sm")}>
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-center text-sm text-slate-600">{range ?? `Page ${page}`}</span>
      {hasMore ? (
        <Link href={hrefFor(page + 1)} className={buttonClass("secondary", "sm")}>
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

// A page number from the address: whole numbers from 1, and never past the last page.
export function pageFromParam(value: string | undefined, total: number, pageSize: number): number {
  const asked = Math.max(1, Number.parseInt(value ?? "1", 10) || 1);
  return Math.min(asked, Math.max(1, Math.ceil(total / pageSize)));
}
