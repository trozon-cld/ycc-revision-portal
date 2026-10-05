// The Flag for review button (56px, amber when on), shared by Practice and the Mock test.
export function FlagToggle({ flagged, onClick, disabled = false }: { flagged: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={flagged}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border-2 px-6 text-lg font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto ${
        flagged ? "border-amber-700 bg-amber-50 text-amber-950 hover:bg-amber-100" : "border-ink/25 bg-white text-ink hover:border-primary hover:text-primary"
      }`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 shrink-0" fill={flagged ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M5 21V4m0 0h11l-2 4 2 4H5" />
      </svg>
      {flagged ? "Flagged for review" : "Flag for review"}
    </button>
  );
}
