import { BUTTON_BASE } from "@/components/candidate/buttons";
import { Icon } from "@/components/icons";

// The Flag for review button (orange when on), shared by Practice and the Mock test.
export function FlagToggle({ flagged, onClick, disabled = false }: { flagged: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={flagged}
      onClick={onClick}
      disabled={disabled}
      className={`${BUTTON_BASE} w-full sm:w-auto ${
        flagged ? "border-warn border-b-warn-strong bg-warn-bg text-warn-strong" : "border-line border-b-edge bg-card text-primary hover:bg-fill-soft"
      }`}
    >
      <Icon name="flag" weight={flagged ? "fill" : "bold"} />
      {flagged ? "Flagged for review" : "Flag for review"}
    </button>
  );
}
