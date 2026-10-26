import { SPEECH_PART_CHARS } from "./limits";
import { VoiceError, type SpeechMaker, type Translator, type VoiceErrorKind } from "./services";

// Stand-in services for tests and local trials without a key (VOICE_PROVIDER=fake; refused in production).
// Text containing [[fail:<kind>]] makes the call fail with that error, to try the error messages.
function failIfAsked(text: string) {
  const kind = /\[\[fail:([a-z_]+)\]\]/.exec(text)?.[1];
  if (kind) throw new VoiceError(kind as VoiceErrorKind, "fake service asked to fail");
}

export function fakeTranslator(): Translator {
  return {
    name: "fake",
    characters: (texts) => texts.reduce((sum, text) => sum + [...text].length, 0),
    async translate({ to, blocks }, _signal, onSent) {
      failIfAsked(JSON.stringify(blocks));
      onSent?.(blocks.flatMap((block) => block.texts).reduce((sum, text) => sum + [...text].length, 0));
      return blocks.map((block) => ({ id: block.id, texts: block.texts.map((text) => `[${to.code}] ${text}`) }));
    },
  };
}

// A quiet tone about as long as the text would take to read (70 ms a character, at most 2 minutes).
export function fakeSpeech(): SpeechMaker {
  return {
    name: "fake",
    voice: "tone",
    partLimit: { chars: SPEECH_PART_CHARS },
    async speak({ text }) {
      failIfAsked(text);
      const rate = 24000;
      const samples = Math.min(rate * 120, Math.round(text.length * 0.07 * rate));
      const wav = new Uint8Array(44 + samples * 2);
      const view = new DataView(wav.buffer);
      const put = (at: number, s: string) => [...s].forEach((c, i) => (wav[at + i] = c.charCodeAt(0)));
      put(0, "RIFF");
      view.setUint32(4, 36 + samples * 2, true);
      put(8, "WAVEfmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, rate, true);
      view.setUint32(28, rate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      put(36, "data");
      view.setUint32(40, samples * 2, true);
      for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.round(3000 * Math.sin((2 * Math.PI * 220 * i) / rate)), true);
      return { bytes: wav, mimeType: "audio/wav" };
    },
  };
}
