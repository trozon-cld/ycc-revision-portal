// Limits for the voice service (translation and speech). Changing a number here is all it takes.
export const VOICE_REQUESTS_PER_HOUR = 30;
// One call to the service gives up after this long; the page then says it took too long.
export const VOICE_REQUEST_TIMEOUT_MS = 90_000;
// Longer pages are spoken in parts of about this many characters (split between blocks).
export const SPEECH_PART_CHARS = 3000;
// Stored audio: mono MP3 at this bitrate (speech stays clear; about 0.36 MB a minute).
export const MP3_KBPS = 48;
// Longest fixed spoken phrase (voice_phrases.text).
export const VOICE_PHRASE_MAX_LENGTH = 300;
