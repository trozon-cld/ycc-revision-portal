import Link from "next/link";
import { Children, isValidElement, type ReactNode } from "react";
import { FilterApplyButton, FilterForm } from "./filter-form";
import { buttonClass, inputClass } from "./styles";

// Filters live in the URL, so they survive refreshes and can be shared.
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
  // Phones lay filters out two per row (search takes a whole row); with an even number of selects Apply would sit alone.
  const selects = Children.toArray(children).filter((child) => isValidElement(child) && child.type === FilterSelect).length;
  return (
    <FilterForm action={action} className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      {hidden &&
        Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      {children}
      <div className={`flex gap-2 ${selects % 2 === 0 ? "col-span-2" : ""}`}>
        <FilterApplyButton className={`${buttonClass("secondary")} flex-1 sm:flex-none`} />
        {isFiltered && (
          <Link href={clearHref} className={`${buttonClass("ghost")} flex-1 sm:flex-none`}>
            Clear
          </Link>
        )}
      </div>
    </FilterForm>
  );
}

export function FilterSearch({ name, label, defaultValue, wide = false }: { name: string; label: string; defaultValue: string; wide?: boolean }) {
  return (
    <div className={`col-span-2 sm:w-64 ${wide ? "md:w-80" : ""}`}>
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
    <div className="min-w-0 sm:w-48 lg:w-44">
      <label htmlFor={`filter-${name}`} className="sr-only">
        {label}
      </label>
      <select id={`filter-${name}`} name={name} defaultValue={defaultValue} className={inputClass}>
        {children}
      </select>
    </div>
  );
}
