import type { VoiceLanguage } from "./languages";
import type { TranslatableBlock } from "./translation";

// The two services behind translation and audio. Gemini today; Google Cloud Translation and Text-to-Speech
// (or any other) later means one new file implementing these, chosen with VOICE_PROVIDER.
// What is being translated: a Handbook page's blocks, a question page (the question, then its options), or a
// language's fixed spoken phrases (Manage languages).
export type TranslationKind = "page" | "question" | "phrases";

// What the translator needs to know about a language (a new one may not have its phrases yet).
export type TranslatorLanguage = Pick<VoiceLanguage, "code" | "name" | "nativeName" | "translatorNote">;

export interface Translator {
  readonly name: string;
  translate(request: { from: TranslatorLanguage; to: TranslatorLanguage; blocks: TranslatableBlock[]; kind?: TranslationKind }, signal: AbortSignal): Promise<unknown>;
}

export type SpeechAudio = { bytes: Uint8Array; mimeType: string };

export interface SpeechMaker {
  readonly name: string;
  readonly voice: string;
  speak(request: { text: string; language: VoiceLanguage }, signal: AbortSignal): Promise<SpeechAudio>;
}

export type VoiceErrorKind =
  | "not_set_up"
  | "key"
  | "billing"
  | "setting"
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
  setting: "The voice service doesn't accept the thinking level for this model. Set GEMINI_THINKING_LEVEL=low in the server settings (or remove it) and restart.",
  daily_limit: "Today's limit for the voice service is used up. Please try again tomorrow.",
  rate_limit: "The voice service is getting too many requests. Please wait a minute and try again.",
  busy: "The voice service is busy at the moment. Please try again in a few minutes.",
  blocked: "The voice service refused this text. Check the page for anything unusual and try again.",
  timeout: "The voice service took too long to answer. Please try again.",
  bad_reply: "The voice service sent back something unexpected. Nothing was saved. Please try again.",
  failed: "The voice service couldn't do this just now. Nothing was saved. Please try again.",
};

export class VoiceError extends Error {
  constructor(
    readonly kind: VoiceErrorKind,
    readonly detail?: string
  ) {
    super(MESSAGES[kind]);
    this.name = "VoiceError";
  }
}
