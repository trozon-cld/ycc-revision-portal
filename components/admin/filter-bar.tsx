import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClass, inputClass } from "./styles";

// Plain GET form: filters live in the URL, so they survive refreshes and can be shared.
export function FilterBar({
  action,
  clearHref,
  isFiltered,
  hidden,
  children,
}: {
  action: string;
  clearHref: string;
  isFiltered: boolean;
  hidden?: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <form method="get" action={action} className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      {hidden &&
        Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      {children}
      <div className="flex gap-2">
        <button type="submit" className={`${buttonClass("secondary")} flex-1 sm:flex-none`}>
          Apply
        </button>
        {isFiltered && (
          <Link href={clearHref} className={`${buttonClass("ghost")} flex-1 sm:flex-none`}>
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}

export function FilterSearch({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return (
    <div className="col-span-2 sm:w-64">
      <label htmlFor={`filter-${name}`} className="sr-only">
        {label}
      </label>
      <input
        id={`filter-${name}`}
        name={name}
        type="search"
        defaultValue={defaultValue}
        placeholder={label}
        className={inputClass}
      />
    </div>
  );
}

export function FilterSelect({
  name,
  label,
  defaultValue,
  children,
}: {
  name: string;
  label: string;
  defaultValue: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 sm:w-48">
      <label htmlFor={`filter-${name}`} className="sr-only">
        {label}
      </label>
      <select id={`filter-${name}`} name={name} defaultValue={defaultValue} className={inputClass}>
        {children}
      </select>
    </div>
  );
}
