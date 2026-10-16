import type { Block } from "@/lib/content/blocks";
import { encodeMp3, joinPcm, readSpeechAudio, durationMs, AudioFormatError, type Pcm } from "./audio";
import { fakeSpeech, fakeTranslator } from "./fake";
import { geminiSpeech, geminiTranslator } from "./gemini";
import { SOURCE_LANGUAGE, voiceLanguage, type VoiceLanguage } from "./languages";
import { VOICE_REQUEST_TIMEOUT_MS } from "./limits";
import { takeVoiceRequests } from "./quota";
import { readingParts, speechChunks } from "./reading";
import { VoiceError, type SpeechMaker, type Translator } from "./services";
import { applyTranslation, toTranslatable } from "./translation";

// The page editor's two jobs: translate a page, and turn a page (English or translated) into one MP3.
// Each call to the service counts toward the editor's hourly cap; nothing is saved here.

function services(): { translator: Translator; speech: SpeechMaker } {
  const provider = (process.env.VOICE_PROVIDER?.trim() || "gemini").toLowerCase();
  if (provider === "fake" && process.env.NODE_ENV !== "production") return { translator: fakeTranslator(), speech: fakeSpeech() };
  if (provider !== "gemini") throw new VoiceError("not_set_up", `unknown VOICE_PROVIDER "${provider}"`);
  return { translator: geminiTranslator(), speech: geminiSpeech() };
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

function language(code: string): VoiceLanguage {
  const found = voiceLanguage(code);
  if (!found) throw new VoiceError("failed", `unknown language ${code}`);
  return found;
}

export async function translatePage(userId: string, blocks: Block[], to: string): Promise<{ blocks: Block[]; provider: string }> {
  if (to === SOURCE_LANGUAGE) throw new VoiceError("failed", "English is the source and isn't translated");
  const translatable = toTranslatable(blocks);
  if (translatable.length === 0) throw new VoiceError("failed", "the page has no text to translate");
  const { translator } = services();
  await takeVoiceRequests(userId, "translate", 1);
  const reply = await withTimeout((signal) => translator.translate({ from: language(SOURCE_LANGUAGE), to: language(to), blocks: translatable }, signal));
  const result = applyTranslation(blocks, reply);
  if (!result.ok) throw new VoiceError("bad_reply", result.error);
  return { blocks: result.blocks, provider: translator.name };
}

export type PageSpeech = { mp3: Uint8Array<ArrayBuffer>; durationMs: number; provider: string; voice: string };

// One MP3 for the page in this language (blocks already in that language). Long pages go in parts.
export async function speakPage(userId: string, blocks: Block[], code: string): Promise<PageSpeech> {
  const lang = language(code);
  const chunks = speechChunks(readingParts(blocks, lang));
  if (chunks.length === 0) throw new VoiceError("failed", "the page has nothing to read aloud");
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
