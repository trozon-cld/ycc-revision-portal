import { gunzipSync } from "node:zlib";
import type { NextRequest } from "next/server";
import { readSmallBody } from "@/lib/auth/request";
import { MAX_AUDIO_DATA_BYTES, MAX_AUDIO_JSON_BYTES } from "./limits";

// Server-only: an audio restore's records, sent gzipped by the browser; read only up to the size limits.
export async function readAudioRestoreBody(request: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false; status: number; problem: string }> {
  const body = await readSmallBody(request, MAX_AUDIO_DATA_BYTES);
  if (!body.ok) return { ok: false, status: body.tooLarge ? 413 : 400, problem: body.tooLarge ? "This audio backup is too large to restore." : "Something went wrong. Please try again." };
  try {
    return { ok: true, value: JSON.parse(gunzipSync(body.bytes, { maxOutputLength: MAX_AUDIO_JSON_BYTES }).toString("utf8")) };
  } catch {
    return { ok: false, status: 400, problem: "The audio backup is damaged." };
  }
}
