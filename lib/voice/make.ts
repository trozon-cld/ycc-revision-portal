import type { Block } from "@/lib/content/blocks";
import { characterCount } from "@/lib/text";
import { encodeMp3, joinPcm, readSpeechAudio, durationMs, AudioFormatError, type Pcm } from "./audio";
import { fakeSpeech, fakeTranslator } from "./fake";
import { geminiSpeech } from "./gemini";
import { googleSpeech, googleTranslator } from "./google";
import { audioService } from "./language-catalogue";
import { findVoiceLanguage } from "./language-store";
import { SOURCE_LANGUAGE, type VoiceLanguage } from "./languages";
import { VOICE_REQUEST_TIMEOUT_MS } from "./limits";
import { reserveVoiceUsage, settleVoiceUsage, VoiceQuotaError, type GeminiCalls } from "./quota";
import { readingParts, speechChunks } from "./reading";
import { failureOf, serviceOf, VoiceError, type SpeechMaker, type TranslationKind, type Translator, type TranslatorLanguage, type VoiceFailure } from "./services";
import { applyTranslation, matchTranslation, toTranslatable, type TranslatableBlock } from "./translation";

// The editors' two jobs: translate a page or question, and turn one (English or translated) into one MP3.
// Each job's characters are reserved from the editor's hourly allowance before it starts; nothing is saved here.

// google (the default): Google Cloud Translation, and audio from the service the language list names for each
// language (Google Text-to-Speech, or Gemini for Welsh). fake: the stand-in for local trials and tests.
function standInRequested(): boolean {
  const name = (process.env.VOICE_PROVIDER?.trim() || "google").toLowerCase();
  if (name === "fake" && process.env.NODE_ENV !== "production") return true;
  if (name === "google") return false;
  throw new VoiceError("not_set_up", `unknown VOICE_PROVIDER "${name}"`);
}

function translatorFor(): Translator {
  return standInRequested() ? fakeTranslator() : googleTranslator();
}

function speechFor(code: string): SpeechMaker {
  if (standInRequested()) return fakeSpeech();
  return audioService(code) === "gemini" ? geminiSpeech() : googleSpeech();
}

// A job run by bulk Listen: translations are checked automatically, and nothing is logged item by item.
export type VoiceJobOptions = { bulk?: boolean };

// `limit`: a usage limit stopped it (the hourly one, a daily one), not a fault.
export type VoiceFailureResult = { ok: false; error: string; failure?: VoiceFailure; waitMs?: number; limit?: boolean };

// What staff see when the voice service fails or a limit is reached (the service's own words go to the log), and
// what a bulk run should do about it.
export function voiceFailure(error: unknown): VoiceFailureResult {
  if (error instanceof VoiceError) {
    if (error.detail) console.error("Voice service:", error.kind, error.detail);
    const failure = failureOf(error.kind);
    if (error.kind === "daily_limit") return { ok: false, error: error.message, failure: "stop", limit: true };
    return failure ? { ok: false, error: error.message, failure } : { ok: false, error: error.message };
  }
  if (error instanceof VoiceQuotaError) {
    return error.waitMs
      ? { ok: false, error: error.message, failure: "retry", waitMs: error.waitMs }
      : { ok: false, error: error.message, failure: "stop", limit: true };
  }
  throw error;
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VOICE_REQUEST_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function language(code: string): Promise<VoiceLanguage> {
  const found = await findVoiceLanguage(code);
  if (!found) throw new VoiceError("failed", `unknown language ${code}`);
  return found;
}

// Sends texts to the translator and checks every item comes back once, with the same number of texts.
// The service sees short ids ("1", "2", …) instead of the real ones: fewer characters to copy back exactly.
export async function translateItems(
  userId: string,
  items: TranslatableBlock[],
  to: string | TranslatorLanguage,
  kind: TranslationKind = "page"
): Promise<{ items: TranslatableBlock[]; provider: string }> {
  const target = typeof to === "string" ? await language(to) : to;
  if (target.code === SOURCE_LANGUAGE) throw new VoiceError("failed", "English is the source and isn't translated");
  if (items.length === 0) throw new VoiceError("failed", "there is no text to translate");
  const translator = translatorFor();
  const sent = items.map((item, index) => ({ id: String(index + 1), texts: item.texts }));
  const from = await language(SOURCE_LANGUAGE);
  const reservation = await reserveVoiceUsage(userId, "translate", serviceOf(translator.name), translator.characters(items.flatMap((item) => item.texts)));
  let accepted = 0;
  let reply: unknown;
  try {
    reply = await withTimeout((signal) => translator.translate({ from, to: target, blocks: sent, kind }, signal, (characters) => (accepted += characters)));
  } finally {
    await settleVoiceUsage(reservation, accepted);
  }
  const result = matchTranslation(sent, reply);
  if (!result.ok) throw new VoiceError("bad_reply", result.error);
  return { items: result.items.map((item, index) => ({ id: items[index].id, texts: item.texts })), provider: translator.name };
}

export async function translatePage(userId: string, blocks: Block[], to: string): Promise<{ blocks: Block[]; provider: string }> {
  const translatable = toTranslatable(blocks);
  if (translatable.length === 0) throw new VoiceError("failed", "the page has no text to translate");
  const { items, provider } = await translateItems(userId, translatable, to);
  const result = applyTranslation(blocks, items);
  if (!result.ok) throw new VoiceError("bad_reply", result.error);
  return { blocks: result.blocks, provider };
}

export type PageSpeech = { mp3: Uint8Array<ArrayBuffer>; durationMs: number; provider: string; voice: string };

// One MP3 for the page in this language (blocks already in that language). Long pages go in parts.
export async function speakPage(userId: string, blocks: Block[], code: string): Promise<PageSpeech> {
  return speakParts(userId, readingParts(blocks, await language(code)), code);
}

// One MP3 from the parts read aloud, in order, sent to the voice service in chunks.
export async function speakParts(userId: string, readParts: string[], code: string): Promise<PageSpeech> {
  const lang = await language(code);
  const speech = speechFor(code);
  const chunks = speechChunks(readParts, speech.partLimit);
  if (chunks.length === 0) throw new VoiceError("failed", "there is nothing to read aloud");
  // A language the service can't speak is refused before anything is counted toward the cap.
  if (speech.checkLanguage) await withTimeout((signal) => speech.checkLanguage!(lang, signal));
  // A Gemini-voiced language counts its calls against its own limits (one call per part).
  const calls: GeminiCalls | undefined = audioService(code) === "gemini" ? { language: code, name: lang.name, count: chunks.length } : undefined;
  const reservation = await reserveVoiceUsage(userId, "speech", serviceOf(speech.name), characterCount(chunks), calls);
  const parts: Pcm[] = [];
  let voice = speech.voice;
  let accepted = 0;
  try {
    for (const text of chunks) {
      const audio = await withTimeout((signal) => speech.speak({ text, language: lang }, signal));
      accepted += characterCount(text);
      voice = audio.voice ?? voice;
      try {
        parts.push(readSpeechAudio(audio.bytes, audio.mimeType));
      } catch (error) {
        if (error instanceof AudioFormatError) throw new VoiceError("bad_reply", error.message);
        throw error;
      }
    }
  } finally {
    await settleVoiceUsage(reservation, accepted);
  }
  const pcm = joinPcm(parts);
  if (pcm.samples.length === 0) throw new VoiceError("bad_reply", "audio is empty");
  return { mp3: encodeMp3(pcm), durationMs: durationMs(pcm), provider: speech.name, voice };
}
