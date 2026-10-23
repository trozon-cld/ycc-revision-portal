import { isRecord } from "@/lib/text";
import { googleTranslateCode } from "./language-catalogue";
import { GOOGLE_REQUEST_TIMEOUT_MS, TRANSLATE_BATCH_CHARS, TRANSLATE_BATCH_TEXTS } from "./limits";
import { VoiceError, type Translator } from "./services";

// Google Cloud Translation (Basic, v2) over plain fetch. Server only: it reads GOOGLE_CLOUD_API_KEY, sent in a header.
// Texts go as HTML so bold (**…**) and line breaks survive; Google keeps their order, so no ids are sent.
const TRANSLATE_ENDPOINT = "https://translation.googleapis.com/language/translate/v2";

function apiKey(): string {
  const key = process.env.GOOGLE_CLOUD_API_KEY?.trim();
  if (!key) throw new VoiceError("not_set_up", "GOOGLE_CLOUD_API_KEY missing", "Translation isn't set up yet. Add GOOGLE_CLOUD_API_KEY to the server settings.");
  return key;
}

// ---- Our text ⇄ the HTML Google translates ----

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// **bold** becomes <b>bold</b> and line breaks <br>; everything else is plain text.
export function toGoogleHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^\n]+?)\*\*/g, "<b>$1</b>")
    .replace(/\r?\n/g, "<br>");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

// Back from Google's HTML: <b> to **, <br> to line breaks, no other tags, entities decoded, spaces tidied.
export function fromGoogleHtml(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<b>\s*([\s\S]*?)\s*<\/b>/gi, (_whole, inner: string) => (inner ? `**${inner}**` : ""))
    .replace(/<[^>]*>/g, "");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

// ---- Batches within Google's recommended request size ----

export function translateBatches(texts: string[], maxChars = TRANSLATE_BATCH_CHARS, maxTexts = TRANSLATE_BATCH_TEXTS): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const text of texts) {
    const length = [...text].length;
    if (current.length > 0 && (size + length > maxChars || current.length >= maxTexts)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(text);
    size += length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

// ---- Errors in plain words (Google's own message goes to the server log) ----

function errorFor(status: number, body: string): VoiceError {
  let reason = "";
  let message = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: { status?: unknown; message?: unknown; errors?: { reason?: unknown }[]; details?: { reason?: unknown }[] } };
    const error = parsed.error ?? {};
    reason = [error.status, ...(error.errors ?? []).map((item) => item.reason), ...(error.details ?? []).map((item) => item.reason)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    message = String(error.message ?? message);
  } catch {
    // not JSON: keep the raw text for the log
  }
  const detail = `${status} ${reason}: ${message}`;
  const has = (...words: string[]) => words.some((word) => reason.includes(word) || message.toLowerCase().includes(word));
  if (has("api key not valid", "api_key_invalid", "keyinvalid", "api key expired")) {
    return new VoiceError("key", detail, "Google didn't accept the API key. Check GOOGLE_CLOUD_API_KEY in the server settings.");
  }
  if (has("billing")) return new VoiceError("billing", detail, "The Google Cloud project needs billing turned on before it can translate.");
  if (has("service_disabled", "accessnotconfigured", "has not been used", "is disabled")) {
    return new VoiceError("disabled", detail, "The Cloud Translation API isn't turned on for the Google Cloud project. Turn it on in APIs & Services → Library.");
  }
  if (has("api_key_service_blocked", "are blocked")) {
    return new VoiceError("key", detail, "The API key isn't allowed to use Cloud Translation. Add it to the key's API restrictions in Google Cloud.");
  }
  if (status === 429 || has("resource_exhausted", "ratelimitexceeded", "quota")) {
    return has("daily", "per day")
      ? new VoiceError("daily_limit", detail, "Today's translation limit in Google Cloud is used up. Please try again tomorrow, or raise the quota.")
      : new VoiceError("rate_limit", detail);
  }
  if (status === 403) return new VoiceError("key", detail, "Google refused the request. Check the API key's restrictions and the project in Google Cloud.");
  if (status >= 500) return new VoiceError("busy", detail);
  return new VoiceError("failed", detail);
}

// One request, with its own time limit, also stopped when the whole job is stopped.
async function translateRequest(key: string, texts: string[], target: string, parent: AbortSignal): Promise<string[]> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  const timer = setTimeout(stop, GOOGLE_REQUEST_TIMEOUT_MS);
  parent.addEventListener("abort", stop);
  let response: Response;
  try {
    response = await fetch(TRANSLATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "x-goog-api-key": key },
      body: JSON.stringify({ q: texts, source: "en", target, format: "html" }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new VoiceError("timeout", "no reply within the time limit");
    throw new VoiceError("failed", `network: ${String(error)}`);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", stop);
  }
  const body = await response.text().catch(() => "");
  if (!response.ok) throw errorFor(response.status, body);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new VoiceError("bad_reply", `not JSON: ${body.slice(0, 200)}`);
  }
  const translations = isRecord(json) && isRecord(json.data) && Array.isArray(json.data.translations) ? json.data.translations : null;
  if (!translations || translations.length !== texts.length) throw new VoiceError("bad_reply", "translation count differs from the texts sent");
  return translations.map((item) => {
    if (!isRecord(item) || typeof item.translatedText !== "string") throw new VoiceError("bad_reply", "a translation is missing its text");
    return item.translatedText;
  });
}

export function googleTranslator(): Translator {
  return {
    name: "google:translate-v2",
    async translate({ to, blocks, kind = "page" }, signal) {
      const key = apiKey();
      const target = googleTranslateCode(to.code);
      // Every text of every block, in order; empty ones aren't sent (nothing to translate, and they'd still be charged).
      const flat = blocks.flatMap((block) => block.texts);
      const sendable = flat.map((text, index) => ({ index, html: toGoogleHtml(text) })).filter((item) => item.html.trim() !== "");
      const batches = translateBatches(sendable.map((item) => item.html));
      const started = Date.now();
      const translated: string[] = [];
      try {
        for (const batch of batches) translated.push(...(await translateRequest(key, batch, target, signal)));
      } finally {
        const characters = sendable.reduce((sum, item) => sum + [...item.html].length, 0);
        console.info(
          `Voice service: ${kind} translation into ${to.name}, ${flat.length} parts, ${batches.length} request${batches.length === 1 ? "" : "s"}, ${characters} characters, google translate v2, ${Date.now() - started} ms`
        );
      }
      const out = [...flat];
      sendable.forEach((item, position) => {
        out[item.index] = fromGoogleHtml(translated[position]);
      });
      let next = 0;
      return blocks.map((block) => ({ id: block.id, texts: block.texts.map(() => out[next++]) }));
    },
  };
}
