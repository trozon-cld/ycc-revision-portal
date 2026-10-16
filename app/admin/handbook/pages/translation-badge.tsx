import { Badge, type BadgeTone } from "@/components/admin/badge";
import { TRANSLATION_STATE_LABELS, type TranslationState } from "@/lib/voice/status";

const TONES: Record<TranslationState, BadgeTone> = { missing: "neutral", draft: "info", checked: "success", outdated: "warning" };

export function TranslationBadge({ state }: { state: TranslationState }) {
  return <Badge tone={TONES[state]}>{state === "checked" ? "✓ " : ""}{TRANSLATION_STATE_LABELS[state]}</Badge>;
}
