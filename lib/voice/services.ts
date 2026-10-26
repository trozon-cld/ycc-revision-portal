import type { VoiceLanguage } from "./languages";
import type { TranslatableBlock } from "./translation";

// The two services behind translation and audio, chosen with VOICE_PROVIDER: Google Cloud (google.ts), Gemini
// (gemini.ts) or the stand-in (fake.ts). Another provider is one new file implementing these.
// What is being translated: a Handbook page's blocks, a question page (the question, then its options), or a
// language's fixed spoken phrases (Manage languages).
export type TranslationKind = "page" | "question" | "phrases";

// What the translator needs to know about a language (a new one may not have its phrases yet).
export type TranslatorLanguage = Pick<VoiceLanguage, "code" | "name" | "nativeName" | "translatorNote">;

export interface Translator {
  readonly name: string;
  translate(request: { from: TranslatorLanguage; to: TranslatorLanguage; blocks: TranslatableBlock[]; kind?: TranslationKind }, signal: AbortSignal): Promise<unknown>;
}

// `voice`: the voice that spoke it, when the provider picks one per language.
export type SpeechAudio = { bytes: Uint8Array; mimeType: string; voice?: string };

// How much text one request may carry: characters, or UTF-8 bytes (Google counts bytes).
export type SpeechPartLimit = { chars: number } | { bytes: number };

export interface SpeechMaker {
  readonly name: string;
  readonly voice: string;
  readonly partLimit: SpeechPartLimit;
  // Refuses a language it can't speak before anything is counted or sent (optional).
  checkLanguage?(language: VoiceLanguage, signal: AbortSignal): Promise<void>;
  speak(request: { text: string; language: VoiceLanguage }, signal: AbortSignal): Promise<SpeechAudio>;
}

export type VoiceErrorKind =
  | "not_set_up"
  | "key"
  | "billing"
  | "setting"
  | "disabled"
  | "no_voice"
  | "daily_limit"
  | "rate_limit"
  | "busy"
  | "blocked"
  | "timeout"
  | "bad_reply"
  | "failed";

// Shown to staff as is; the service's own message goes to the server log only.
const MESSAGES: Record<VoiceErrorKind, string> = {
  not_set_up: "The voice service isn't set up yet. Add GEMINI_API_KEY to the server settings.",
  key: "The voice service didn't accept the API key. Check GEMINI_API_KEY in the server settings.",
  billing: "The voice service needs billing or credit on its account before it can be used.",
  no_voice: "The voice service has no voice for this language, so audio can't be made for it.",
  disabled: "The voice service's API isn't turned on for this account. Turn it on in the provider's console.",
  setting: "The voice service doesn't accept the thinking level for this model. Set GEMINI_THINKING_LEVEL=low in the server settings (or remove it) and restart.",
  daily_limit: "Today's limit for the voice service is used up. Please try again tomorrow.",
  rate_limit: "The voice service is getting too many requests. Please wait a minute and try again.",
  busy: "The voice service is busy at the moment. Please try again in a few minutes.",
  blocked: "The voice service refused this text. Check the page for anything unusual and try again.",
  timeout: "The voice service took too long to answer. Please try again.",
  bad_reply: "The voice service sent back something unexpected. Nothing was saved. Please try again.",
  failed: "The voice service couldn't do this just now. Nothing was saved. Please try again.",
};

// `message`: a provider's own wording for staff (e.g. naming its setting); otherwise the general one for the kind.
export class VoiceError extends Error {
  constructor(
    readonly kind: VoiceErrorKind,
    readonly detail?: string,
    message?: string
  ) {
    super(message ?? MESSAGES[kind]);
    this.name = "VoiceError";
  }
}
