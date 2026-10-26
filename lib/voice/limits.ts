// Limits for the voice service (translation and speech). Changing a number here is all it takes.
// Characters each staff member may send to the voice services an hour (a page is about 300–2,000).
export const VOICE_CHARACTERS_PER_HOUR = { translate: 200_000, speech: 200_000 } as const;
// Google's free characters each month (checked 23 Oct 2026): Translation; Text-to-Speech WaveNet (Standard has its own).
export const GOOGLE_FREE_CHARACTERS_PER_MONTH = { translate: 500_000, speech: 4_000_000 } as const;
// One call to the service gives up after this long; the page then says it took too long.
export const VOICE_REQUEST_TIMEOUT_MS = 90_000;
// Longer pages are spoken in parts of about this many characters (split between blocks).
export const SPEECH_PART_CHARS = 3000;
// Stored audio: mono MP3 at this bitrate (speech stays clear; about 0.36 MB a minute).
export const MP3_KBPS = 48;
// Longest fixed spoken phrase (voice_phrases.text).
export const VOICE_PHRASE_MAX_LENGTH = 300;
// Google Cloud: one request gives up after this long (Google usually answers within seconds).
export const GOOGLE_REQUEST_TIMEOUT_MS = 30_000;
// Translation requests stay within Google's recommended size: about 5,000 characters, and at most this many texts.
export const TRANSLATE_BATCH_CHARS = 5_000;
export const TRANSLATE_BATCH_TEXTS = 100;
// Google Text-to-Speech takes at most 5,000 bytes a request (Punjabi uses 3 bytes a character): parts stay under this.
export const SPEECH_PART_BYTES = 4_500;
