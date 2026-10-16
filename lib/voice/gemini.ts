import { isRecord } from "@/lib/text";
import { VoiceError, type SpeechMaker, type Translator } from "./services";

// Gemini over plain fetch (Interactions API, no SDK). Server only: it reads GEMINI_API_KEY.
// Nothing is kept on Google's side after the reply (store: false).
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_TEXT_MODEL = "gemini-3.8-flash";
const DEFAULT_SPEECH_MODEL = "gemini-3.8-flash-tts";
const DEFAULT_VOICE = "Kore";
const DEFAULT_STYLE = "Calm, clear and steady, at a moderate teaching pace";

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new VoiceError("not_set_up");
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
    if (signal.aborted) throw new VoiceError("timeout");
    throw new VoiceError("failed", `network: ${String(error)}`);
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
  if (status === 401 || code === "authentication" || has("api key not valid", "api_key_invalid", "leaked")) return new VoiceError("key", detail);
  if (status === 402 || code === "payment_required" || has("billing")) return new VoiceError("billing", detail);
  if (status === 403 || code === "permission_denied") return new VoiceError("key", detail);
  if (status === 429 || has("quota", "rate_limit", "resource_exhausted", "too_many_requests")) {
    return new VoiceError(code === "rate_limit_exceeded" || code === "too_many_requests" || has("per minute") ? "rate_limit" : "daily_limit", detail);
  }
  if (status === 504 || code === "deadline_exceeded") return new VoiceError("timeout", detail);
  if (status >= 500 || code === "service_unavailable" || code === "unavailable") return new VoiceError("busy", detail);
  if (has("safety", "blocked", "recitation", "prohibited")) return new VoiceError("blocked", detail);
  return new VoiceError("failed", detail);
}

export function geminiTranslator(): Translator {
  const model = process.env.GEMINI_TEXT_MODEL?.trim() || DEFAULT_TEXT_MODEL;
  return {
    name: `gemini:${model}`,
    async translate({ from, to, blocks }, signal) {
      const instruction = [
        `Translate study material for construction site workers from ${from.name} into ${to.name} (${to.nativeName}).`,
        to.code === "pa" ? "Use Gurmukhi script." : "",
        "Use plain, everyday words that are easy to understand. Keep the meaning exact; it is safety training.",
        "Keep any text wrapped in ** ** wrapped in ** ** around the matching words of the translation.",
        "Return every block with the same id and the same number of texts, in the same order. Translate nothing else.",
      ]
        .filter(Boolean)
        .join(" ");
      const content = await interact(
        {
          model,
          input: `${instruction}\n\nBlocks (JSON):\n${JSON.stringify(blocks)}`,
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: {
              type: "object",
              properties: {
                blocks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { id: { type: "string" }, texts: { type: "array", items: { type: "string" } } },
                    required: ["id", "texts"],
                  },
                },
              },
              required: ["blocks"],
            },
          },
        },
        signal
      );
      const text = content.filter((item) => typeof item.text === "string").at(-1)?.text;
      if (!text) throw new VoiceError("bad_reply", "no text in translation reply");
      try {
        const parsed = JSON.parse(text) as { blocks?: unknown };
        return parsed.blocks;
      } catch {
        throw new VoiceError("bad_reply", `translation is not JSON: ${text.slice(0, 200)}`);
      }
    },
  };
}

export function geminiSpeech(): SpeechMaker {
  const model = process.env.GEMINI_TTS_MODEL?.trim() || DEFAULT_SPEECH_MODEL;
  const voice = process.env.GEMINI_TTS_VOICE?.trim() || DEFAULT_VOICE;
  const style = process.env.VOICE_READING_STYLE?.trim() || DEFAULT_STYLE;
  return {
    name: `gemini:${model}`,
    voice,
    async speak({ text }, signal) {
      const content = await interact(
        {
          model,
          input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style }] }] }],
          response_format: { type: "audio" },
          generation_config: { speech_config: [{ voice }] },
        },
        signal
      );
      const audio = content.filter((item) => item.type === "audio" && typeof item.data === "string").at(-1);
      if (!audio?.data) throw new VoiceError("bad_reply", "no audio in speech reply");
      const bytes = Buffer.from(audio.data, "base64");
      if (bytes.length < 100) throw new VoiceError("bad_reply", "audio is empty");
      return { bytes: new Uint8Array(bytes), mimeType: audio.mime_type ?? audio.mimeType ?? "audio/wav" };
    },
  };
}
