import { cardClass } from "./styles";

const bar = "rounded bg-slate-200 motion-safe:animate-pulse";

// Placeholder for a staff page that is still loading: header, filter row and a few table rows.
export function PageLoading() {
  return (
    <div role="status" className="admin-loading">
      <h1 className="sr-only">Loading…</h1>
      <div aria-hidden="true">
        <div className="mb-5 space-y-2">
          <div className={`${bar} h-7 w-48 max-w-full`} />
          <div className={`${bar} h-4 w-72 max-w-full`} />
        </div>
        <div className="mb-4 flex gap-2">
          <div className={`${bar} h-11 w-full max-w-sm`} />
          <div className={`${bar} h-11 w-24 shrink-0`} />
        </div>
        <div className={`${cardClass} divide-y divide-slate-100`}>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center gap-4 px-4 py-3.5">
              <div className={`${bar} h-4 flex-1`} />
              <div className={`${bar} h-4 w-1/5 max-md:hidden`} />
              <div className={`${bar} h-4 w-1/6`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
