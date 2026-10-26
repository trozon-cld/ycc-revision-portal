import { isRecord } from "@/lib/text";
import { SPEECH_PART_CHARS } from "./limits";
import { networkError, VoiceError, type SpeechMaker } from "./services";

// Gemini audio over plain fetch (Interactions API, no SDK), for the languages the list gives to it (Welsh).
// Server only: it reads GEMINI_API_KEY. Nothing is kept on Google's side after the reply (store: false).
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_SPEECH_MODEL = "gemini-3.8-flash-tts";
const DEFAULT_VOICE = "Kore";
const DEFAULT_STYLE = "Calm, clear and steady, at a moderate teaching pace";
const NOT_SET_UP = "Gemini isn't set up yet. Add GEMINI_API_KEY to the server settings.";

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new VoiceError("not_set_up", "GEMINI_API_KEY missing", NOT_SET_UP);
  return key;
}

type Content = { type?: string; text?: string; data?: string; mime_type?: string; mimeType?: string };

async function interact(body: Record<string, unknown>, signal: AbortSignal): Promise<Content[]> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
      body: JSON.stringify({ ...body, store: false }),
      signal,
    });
  } catch (error) {
    if (error instanceof VoiceError) throw error;
    if (signal.aborted) throw new VoiceError("timeout", "no reply within the time limit");
    throw networkError(error, "Gemini");
  }
  const text = await response.text().catch(() => "");
  if (!response.ok) throw errorFor(response.status, text);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new VoiceError("bad_reply", `not JSON: ${text.slice(0, 200)}`);
  }
  if (!isRecord(json)) throw new VoiceError("bad_reply", "reply is not an object");
  if (json.status === "failed") {
    const first = Array.isArray(json.errors) && isRecord(json.errors[0]) ? json.errors[0] : {};
    throw errorFor(0, JSON.stringify({ error: first }));
  }
  if (json.status === "incomplete") throw new VoiceError("bad_reply", "reply was cut short (incomplete)");
  return outputContent(json);
}

// The model's output: the content of the last model_output step (older replies: an outputs list).
function outputContent(json: Record<string, unknown>): Content[] {
  const steps = Array.isArray(json.steps) ? json.steps.filter(isRecord) : [];
  const out = steps.filter((step) => step.type === "model_output").flatMap((step) => (Array.isArray(step.content) ? step.content : []));
  if (out.length) return out.filter(isRecord) as Content[];
  if (Array.isArray(json.outputs)) return json.outputs.filter(isRecord) as Content[];
  throw new VoiceError("bad_reply", `no output in reply (status ${String(json.status)})`);
}

const KEY_REFUSED = "Gemini didn't accept the API key. Check GEMINI_API_KEY in the server settings.";

function errorFor(status: number, body: string): VoiceError {
  let code = "";
  let message = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown; status?: unknown; message?: unknown } };
    code = String(parsed.error?.code ?? parsed.error?.status ?? "").toLowerCase();
    message = String(parsed.error?.message ?? message);
  } catch {
    // not JSON: keep the raw text for the log
  }
  const detail = `${status} ${code}: ${message}`;
  const has = (...words: string[]) => words.some((word) => code.includes(word) || message.toLowerCase().includes(word));
  if (status === 401 || code === "authentication" || has("api key not valid", "api_key_invalid", "leaked")) return new VoiceError("key", detail, KEY_REFUSED);
  if (status === 402 || code === "payment_required" || has("billing")) return new VoiceError("billing", detail);
  if (status === 403 || code === "permission_denied") return new VoiceError("key", detail, KEY_REFUSED);
  if (status === 429 || has("quota", "rate_limit", "resource_exhausted", "too_many_requests")) {
    return new VoiceError(code === "rate_limit_exceeded" || code === "too_many_requests" || has("per minute") ? "rate_limit" : "daily_limit", detail);
  }
  if (status === 504 || code === "deadline_exceeded") return new VoiceError("timeout", detail);
  if (status >= 500 || code === "service_unavailable" || code === "unavailable") return new VoiceError("busy", detail);
  if (has("safety", "blocked", "recitation", "prohibited")) return new VoiceError("blocked", detail);
  return new VoiceError("failed", detail);
}

export function geminiSpeech(): SpeechMaker {
  const model = process.env.GEMINI_TTS_MODEL?.trim() || DEFAULT_SPEECH_MODEL;
  const voice = process.env.GEMINI_TTS_VOICE?.trim() || DEFAULT_VOICE;
  const style = process.env.VOICE_READING_STYLE?.trim() || DEFAULT_STYLE;
  return {
    name: `gemini:${model}`,
    voice,
    partLimit: { chars: SPEECH_PART_CHARS },
    // A missing key is said before anything is counted, naming the language (Welsh audio comes from Gemini).
    async checkLanguage(language) {
      if (!process.env.GEMINI_API_KEY?.trim()) {
        throw new VoiceError("not_set_up", "GEMINI_API_KEY missing", `${language.name} audio uses Gemini. Add GEMINI_API_KEY to the server settings.`);
      }
    },
    async speak({ text, language }, signal) {
      // One line per part in the server window (no text or key).
      const started = Date.now();
      const content = await interact(
        {
          model,
          input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style }] }] }],
          response_format: { type: "audio" },
          generation_config: { speech_config: [{ voice }] },
        },
        signal
      ).finally(() => console.info(`Voice service: speech in ${language.name}, ${[...text].length} characters, ${model}, voice ${voice}, ${Date.now() - started} ms`));
      const audio = content.filter((item) => item.type === "audio" && typeof item.data === "string").at(-1);
      if (!audio?.data) throw new VoiceError("bad_reply", "no audio in speech reply");
      const bytes = Buffer.from(audio.data, "base64");
      if (bytes.length < 100) throw new VoiceError("bad_reply", "audio is empty");
      return { bytes: new Uint8Array(bytes), mimeType: audio.mime_type ?? audio.mimeType ?? "audio/wav" };
    },
  };
}
