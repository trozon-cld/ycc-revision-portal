import { Mp3Encoder } from "@breezystack/lamejs";
import { MP3_KBPS } from "./limits";

// Speech arrives as 16-bit mono PCM (in a WAV file or raw); it's joined and stored as MP3.
export type Pcm = { samples: Int16Array; sampleRate: number };

export class AudioFormatError extends Error {}

// Reads a WAV file (RIFF, 16-bit PCM, mono) or raw 16-bit little-endian PCM at a known rate.
export function readSpeechAudio(bytes: Uint8Array, mimeType: string): Pcm {
  const mime = mimeType.toLowerCase();
  if (mime.includes("wav") || isRiff(bytes)) return readWav(bytes);
  if (mime.startsWith("audio/l16") || mime.includes("pcm")) {
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
    return { samples: toInt16(bytes, 0, bytes.length), sampleRate: rate };
  }
  throw new AudioFormatError(`Unexpected audio format: ${mimeType}`);
}

function isRiff(bytes: Uint8Array) {
  return bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE";
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function readWav(bytes: Uint8Array): Pcm {
  if (!isRiff(bytes)) throw new AudioFormatError("Not a WAV file.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let sampleRate = 0;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    // Streamed WAVs may give 0 or 0xFFFFFFFF as the data size: read to the end then.
    const declared = view.getUint32(offset + 4, true);
    const size = id === "data" && (declared === 0 || offset + 8 + declared > bytes.length) ? bytes.length - offset - 8 : declared;
    if (id === "fmt ") {
      const format = view.getUint16(offset + 8, true);
      const channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      const bits = view.getUint16(offset + 22, true);
      if ((format !== 1 && format !== 0xfffe) || channels !== 1 || bits !== 16) {
        throw new AudioFormatError(`Unsupported WAV: format ${format}, ${channels} channels, ${bits} bits.`);
      }
    } else if (id === "data") {
      if (!sampleRate) throw new AudioFormatError("WAV data before its format.");
      return { samples: toInt16(bytes, offset + 8, size), sampleRate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new AudioFormatError("WAV file has no audio.");
}

function toInt16(bytes: Uint8Array, start: number, length: number): Int16Array {
  const count = Math.floor(length / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, count * 2);
  const out = new Int16Array(count);
  for (let i = 0; i < count; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}

// Parts of one page, joined with a short silence between them.
export function joinPcm(parts: Pcm[], gapMs = 400): Pcm {
  if (parts.length === 0) throw new AudioFormatError("No audio to join.");
  const sampleRate = parts[0].sampleRate;
  if (parts.some((part) => part.sampleRate !== sampleRate)) throw new AudioFormatError("Audio parts have different sample rates.");
  const gap = Math.round((sampleRate * gapMs) / 1000);
  const total = parts.reduce((sum, part) => sum + part.samples.length, 0) + gap * (parts.length - 1);
  const samples = new Int16Array(total);
  let at = 0;
  parts.forEach((part, index) => {
    samples.set(part.samples, at);
    at += part.samples.length + (index < parts.length - 1 ? gap : 0);
  });
  return { samples, sampleRate };
}

export function durationMs(pcm: Pcm): number {
  return Math.round((pcm.samples.length / pcm.sampleRate) * 1000);
}

// Mono MP3 at MP3_KBPS; encoded in blocks so long pages don't build one huge array at once.
export function encodeMp3(pcm: Pcm): Uint8Array<ArrayBuffer> {
  const encoder = new Mp3Encoder(1, pcm.sampleRate, MP3_KBPS);
  const chunks: Uint8Array[] = [];
  const BLOCK = 1152 * 20;
  for (let i = 0; i < pcm.samples.length; i += BLOCK) {
    const out = encoder.encodeBuffer(pcm.samples.subarray(i, i + BLOCK));
    if (out.length) chunks.push(new Uint8Array(out));
  }
  const end = encoder.flush();
  if (end.length) chunks.push(new Uint8Array(end));
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.length;
  }
  return result;
}
