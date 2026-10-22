// A small spinning ring for actions in progress (staff row menus, the Handbook's Listen buttons). Takes the
// text colour; stays still under reduced motion.
export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" data-spinner="" className={`shrink-0 motion-safe:animate-spin ${className}`}>
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M10 3a7 7 0 0 1 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
