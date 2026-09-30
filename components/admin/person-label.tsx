import { Breakable } from "./breakable";

// Name above email in admin tables; people created before names existed show "No name yet".
export function PersonLabel({ name, email }: { name: string | null; email: string }) {
  return (
    <span className="block min-w-0">
      <span className={`block ${name ? "" : "font-normal italic text-slate-600"}`}>{name ?? "No name yet"}</span>
      <span className="block text-xs font-normal text-slate-600">
        <Breakable text={email} />
      </span>
    </span>
  );
}
