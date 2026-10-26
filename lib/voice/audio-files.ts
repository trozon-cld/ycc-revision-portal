import { STORAGE_LIMIT_BYTES } from "@/lib/media/limits";
import { StorageConfigError, deleteObjects, getSignedUrls, isStorageConfigured, storeObject } from "@/lib/storage/storage";
import { storedBytes } from "@/lib/storage/usage";

// Server-only: the audio files themselves (private handbook-audio bucket), shared by page audio, question audio and
// deleting a language, with the result types the editors share.

export type AudioSummary = { language: string; sourceVersion: number; durationMs: number; byteSize: number; createdAt: string };
export type AudioResult = { ok: true; audio: AudioSummary } | { ok: false; error: string };
export type AudioDeleteResult = { ok: true } | { ok: false; error: string };
export type AudioLinkResult = { ok: true; url: string } | { ok: false; error: string };

export const AUDIO_NOT_CONFIGURED = "Audio storage isn't set up yet. Add the Supabase settings to the server's environment.";
const STORAGE_FULL = "Storage is full, so no new audio can be made. Delete pictures in Media or audio you no longer need, then try again.";
const SAVE_FAILED = "The audio couldn't be saved. Please try again.";
const MISSING = "This audio no longer exists. Reload the page.";
// Long enough to listen to a page or question in the editor.
const PREVIEW_LINK_SECONDS = 30 * 60;

export async function deleteAudioFilesQuietly(paths: string[]) {
  if (paths.length === 0 || !isStorageConfigured()) return;
  try {
    await deleteObjects(paths, "audio");
  } catch (error) {
    console.error("Audio file cleanup failed", paths, error);
  }
}

// Shared by page and question audio: checks before the voice service is called, and room for the new file.
export async function audioCanStart(): Promise<string | null> {
  if (!isStorageConfigured()) return AUDIO_NOT_CONFIGURED;
  return (await storedBytes()) >= STORAGE_LIMIT_BYTES ? STORAGE_FULL : null;
}

// Stores a new MP3 at `path`; on failure nothing is left behind.
export async function storeAudioFile(path: string, mp3: Uint8Array<ArrayBuffer>): Promise<string | null> {
  if ((await storedBytes()) + mp3.byteLength > STORAGE_LIMIT_BYTES) return STORAGE_FULL;
  try {
    await storeObject(path, new Blob([mp3], { type: "audio/mpeg" }), "audio/mpeg", { area: "audio" });
    return null;
  } catch (error) {
    await deleteAudioFilesQuietly([path]);
    if (error instanceof StorageConfigError) return AUDIO_NOT_CONFIGURED;
    console.error("Audio upload failed", error);
    return SAVE_FAILED;
  }
}

// A short-lived link for listening in an editor (the bucket is private).
export async function audioFileLink(path: string | undefined): Promise<AudioLinkResult> {
  if (!path) return { ok: false, error: MISSING };
  if (!isStorageConfigured()) return { ok: false, error: AUDIO_NOT_CONFIGURED };
  try {
    const urls = await getSignedUrls([path], PREVIEW_LINK_SECONDS, "audio");
    const url = urls.get(path);
    return url ? { ok: true, url } : { ok: false, error: "The audio file is missing from storage. Make it again." };
  } catch (error) {
    console.error("Audio link failed", error);
    return { ok: false, error: "The audio couldn't be opened. Please try again." };
  }
}
