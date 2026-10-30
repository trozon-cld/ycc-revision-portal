import { Badge, type BadgeTone } from "@/components/admin/badge";
import { AUDIO_STATE_LABELS, TRANSLATION_STATE_LABELS, type AudioState, type TranslationState } from "@/lib/voice/status";

const TONES: Record<TranslationState, BadgeTone> = { missing: "neutral", draft: "info", checked: "success", outdated: "warning" };
const AUDIO_TONES: Record<AudioState, BadgeTone> = { missing: "neutral", ready: "success", outdated: "warning", waiting: "neutral" };

// `auto`: checked by a bulk run, not yet by a person.
export function TranslationBadge({ state, auto = false }: { state: TranslationState; auto?: boolean }) {
  if (state === "checked" && auto) return <Badge tone="info">✓ Checked automatically</Badge>;
  return <Badge tone={TONES[state]}>{state === "checked" ? "✓ " : ""}{TRANSLATION_STATE_LABELS[state]}</Badge>;
}

export function AudioBadge({ state }: { state: AudioState }) {
  return <Badge tone={AUDIO_TONES[state]}>{state === "ready" ? "✓ " : ""}{AUDIO_STATE_LABELS[state]}</Badge>;
}
