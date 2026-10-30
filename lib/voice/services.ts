import type { VoiceLanguage } from "./languages";
import type { TranslatableBlock } from "./translation";

// The services behind translation (Google) and audio (Google; Gemini for Welsh), chosen in make.ts; fake.ts stands
// in for tests. Another provider is one new file implementing these.

// What is being translated: a page's blocks, a question page, or a language's spoken phrases (Manage languages).
export type TranslationKind = "page" | "question" | "phrases";

// What the translator needs to know about a language (a new one may not have its phrases yet).
export type TranslatorLanguage = Pick<VoiceLanguage, "code" | "name" | "nativeName">;

export interface Translator {
  readonly name: string;
  // The characters these texts count as for the service (reserved from the hourly allowance before sending).
  characters(texts: string[]): number;
  // `onSent`: characters the service has accepted so far (a failed job keeps only those in the allowance).
  translate(
    request: { from: TranslatorLanguage; to: TranslatorLanguage; blocks: TranslatableBlock[]; kind?: TranslationKind },
    signal: AbortSignal,
    onSent?: (characters: number) => void
  ): Promise<unknown>;
}

// How each service is named to staff (Languages tab "Audio by", usage lines).
export const VOICE_SERVICE_NAMES: Record<string, string> = { google: "Google", gemini: "Gemini", fake: "the test service" };

// The service part of a provider's name ("google:tts-v1" → "google"), for the usage counters.
export function serviceOf(name: string): string {
  return name.split(":")[0];
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
  | "disabled"
  | "no_voice"
  | "daily_limit"
  | "rate_limit"
  | "busy"
  | "blocked"
  | "timeout"
  | "network"
  | "bad_reply"
  | "failed";

// What a bulk run does after a failure: try the same item again after a wait, or stop the whole run. Other
// failures (none) concern one item only: it's listed as failed and the run carries on.
export type VoiceFailure = "retry" | "stop";

const FAILURES: Record<VoiceErrorKind, VoiceFailure | null> = {
  not_set_up: "stop",
  key: "stop",
  billing: "stop",
  disabled: "stop",
  no_voice: "stop",
  daily_limit: "stop",
  rate_limit: "retry",
  busy: "retry",
  blocked: "retry",
  timeout: "retry",
  network: "retry",
  bad_reply: "retry",
  failed: null,
};

export function failureOf(kind: VoiceErrorKind): VoiceFailure | null {
  return FAILURES[kind];
}

// Shown to staff as is; the service's own message goes to the server log only.
const MESSAGES: Record<VoiceErrorKind, string> = {
  not_set_up: "The voice service isn't set up yet. Check its API key in the server settings.",
  key: "The voice service didn't accept the API key. Check it in the server settings.",
  billing: "The voice service needs billing or credit on its account before it can be used.",
  no_voice: "The voice service has no voice for this language, so audio can't be made for it.",
  disabled: "The voice service's API isn't turned on for this account. Turn it on in the provider's console.",
  daily_limit: "Today's limit for the voice service is used up. Please try again tomorrow.",
  rate_limit: "The voice service is getting too many requests. Please wait a minute and try again.",
  busy: "The voice service is busy at the moment. Please try again in a few minutes.",
  blocked: "The voice service refused this text. Check the page for anything unusual and try again.",
  timeout: "The voice service took too long to answer. Please try again.",
  network: "Couldn't reach the voice service just now. This is usually a connection problem. Nothing was saved. Please try again.",
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

// A request that never got a reply (no connection, name lookup failed, connection dropped): the real cause goes
// to the server log, staff are told it was the connection.
export function networkError(error: unknown, service: string): VoiceError {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : null;
  const code = cause && "code" in cause && typeof cause.code === "string" ? cause.code : null;
  const reason = [code, cause?.message ?? (error instanceof Error ? error.message : String(error))].filter(Boolean).join(" ");
  return new VoiceError(
    "network",
    `network: ${reason}`,
    `Couldn't reach ${service} just now. This is usually a connection problem. Nothing was saved. Please try again.`
  );
}
