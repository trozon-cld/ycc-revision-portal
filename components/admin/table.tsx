import type { HTMLAttributes, ReactNode } from "react";

// Below md each row becomes a card: cells stack, and each shows its column label.
export function Table({
  columns,
  isEmpty,
  emptyMessage,
  children,
}: {
  columns: string[];
  isEmpty: boolean;
  emptyMessage: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <table className="block w-full text-sm md:table">
        <thead className="hidden md:table-header-group">
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            {columns.map((column, index) => (
              <th
                key={column || `column-${index}`}
                scope="col"
                className="whitespace-nowrap px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-600 first:rounded-tl-lg last:rounded-tr-lg"
              >
                {column || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="block divide-y divide-slate-200 md:table-row-group">
          {children}
          {isEmpty && (
            <tr className="block md:table-row">
              <td colSpan={columns.length} className="block px-4 py-8 text-center text-slate-600 md:table-cell">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// `extra` adds data attributes and classes, e.g. for drag and drop.
export function Row({ children, extra }: { children: ReactNode; extra?: HTMLAttributes<HTMLTableRowElement> & Record<`data-${string}`, string> }) {
  const { className = "", ...rest } = extra ?? {};
  return (
    <tr {...rest} className={`relative block space-y-1.5 px-4 py-3 md:table-row md:space-y-0 md:p-0 md:hover:bg-slate-50/60 ${className}`}>
      {children}
    </tr>
  );
}

type CellKind = "primary" | "data" | "actions";

const cellClasses: Record<CellKind, string> = {
  primary: "block pr-12 font-medium text-ink md:table-cell md:pr-4",
  data:
    "flex items-baseline justify-between gap-4 text-ink before:shrink-0 before:text-slate-600 before:content-[attr(data-label)] md:table-cell md:before:content-none",
  actions: "absolute right-2 top-1.5 md:static md:w-14 md:text-right",
};

// Phones break anywhere so nothing overflows. On wider screens only the primary cell and
// `breakAnywhere` cells (emails) may break mid-word, so short columns aren't squeezed.
export function Cell({
  label,
  kind = "data",
  nowrap = false,
  breakAnywhere = false,
  children,
}: {
  label?: string;
  kind?: CellKind;
  nowrap?: boolean;
  breakAnywhere?: boolean;
  children: ReactNode;
}) {
  const wrapping =
    kind === "primary" || breakAnywhere
      ? "[overflow-wrap:anywhere]"
      : "[overflow-wrap:anywhere] md:[overflow-wrap:break-word]";
  return (
    <td
      data-label={kind === "data" ? label : undefined}
      className={`${cellClasses[kind]} ${wrapping} ${nowrap ? "md:whitespace-nowrap" : ""} align-middle md:px-4 md:py-2.5`}
    >
      {kind === "data" ? <span className="min-w-0 text-right md:text-left">{children}</span> : children}
    </td>
  );
}
