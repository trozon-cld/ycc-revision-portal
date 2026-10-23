import type { Block } from "@/lib/content/blocks";
import { encodeMp3, joinPcm, readSpeechAudio, durationMs, AudioFormatError, type Pcm } from "./audio";
import { fakeSpeech, fakeTranslator } from "./fake";
import { geminiSpeech, geminiTranslator } from "./gemini";
import { googleTranslator } from "./google";
import { findVoiceLanguage } from "./language-store";
import { SOURCE_LANGUAGE, type VoiceLanguage } from "./languages";
import { VOICE_REQUEST_TIMEOUT_MS } from "./limits";
import { takeVoiceRequests, VoiceQuotaError } from "./quota";
import { readingParts, speechChunks } from "./reading";
import { VoiceError, type SpeechMaker, type TranslationKind, type Translator, type TranslatorLanguage } from "./services";
import { applyTranslation, matchTranslation, toTranslatable, type TranslatableBlock } from "./translation";

// The editors' two jobs: translate a page or question, and turn one (English or translated) into one MP3.
// Each call to the service counts toward the editor's hourly cap; nothing is saved here.

// google (the default): Google Cloud translates; Gemini still speaks until Google's speech is added (G2).
function services(): { translator: Translator; speech: SpeechMaker } {
  const provider = (process.env.VOICE_PROVIDER?.trim() || "google").toLowerCase();
  if (provider === "fake" && process.env.NODE_ENV !== "production") return { translator: fakeTranslator(), speech: fakeSpeech() };
  if (provider === "google") return { translator: googleTranslator(), speech: geminiSpeech() };
  if (provider !== "gemini") throw new VoiceError("not_set_up", `unknown VOICE_PROVIDER "${provider}"`);
  return { translator: geminiTranslator(), speech: geminiSpeech() };
}

// What staff see when the voice service fails or the hourly cap is reached (the service's own words go to the log).
export function voiceFailure(error: unknown): { ok: false; error: string } {
  if (error instanceof VoiceError) {
    if (error.detail) console.error("Voice service:", error.kind, error.detail);
    return { ok: false, error: error.message };
  }
  if (error instanceof VoiceQuotaError) return { ok: false, error: error.message };
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
  const { translator } = services();
  await takeVoiceRequests(userId, "translate", 1);
  const sent = items.map((item, index) => ({ id: String(index + 1), texts: item.texts }));
  const from = await language(SOURCE_LANGUAGE);
  const reply = await withTimeout((signal) => translator.translate({ from, to: target, blocks: sent, kind }, signal));
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
  const chunks = speechChunks(readParts);
  if (chunks.length === 0) throw new VoiceError("failed", "there is nothing to read aloud");
  const { speech } = services();
  await takeVoiceRequests(userId, "speech", chunks.length);
  const parts: Pcm[] = [];
  for (const text of chunks) {
    const audio = await withTimeout((signal) => speech.speak({ text, language: lang }, signal));
    try {
      parts.push(readSpeechAudio(audio.bytes, audio.mimeType));
    } catch (error) {
      if (error instanceof AudioFormatError) throw new VoiceError("bad_reply", error.message);
      throw error;
    }
  }
  const pcm = joinPcm(parts);
  if (pcm.samples.length === 0) throw new VoiceError("bad_reply", "audio is empty");
  return { mp3: encodeMp3(pcm), durationMs: durationMs(pcm), provider: speech.name, voice: speech.voice };
}
