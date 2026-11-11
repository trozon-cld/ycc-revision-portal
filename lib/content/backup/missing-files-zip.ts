import { NOT_THROUGH_MESSAGE } from "@/lib/forms";
import { openAudioZip } from "./audio-zip";
import type { FileKind, MissingCheck } from "./missing-files";
import { openBackupZip } from "./open";

// Browser only: Put back missing files. Opens a content or an audio backup and sends only the files the server asks for.
export type OpenedFiles = { kind: FileKind; what: string; createdAt: string; createdBy: string; files: Map<string, Uint8Array> };
type Progress = (step: string) => void;

export async function openFilesZip(file: File): Promise<{ ok: true; opened: OpenedFiles } | { ok: false; error: string }> {
  const content = await openBackupZip(file);
  if (content.ok) {
    const { manifest, pictures } = content.backup;
    return { ok: true, opened: { kind: "pictures", what: "Content backup (pictures)", createdAt: manifest.createdAt, createdBy: manifest.createdBy, files: pictures } };
  }
  const audio = await openAudioZip(file);
  if (audio.ok) {
    const { manifest, files } = audio.backup;
    return { ok: true, opened: { kind: "audio", what: `Audio backup (${manifest.language.name})`, createdAt: manifest.createdAt, createdBy: manifest.createdBy, files } };
  }
  // A real content backup that's damaged says so; anything else gets the general message.
  const generic = /^This (isn't a backup file|file couldn't be opened)/;
  return { ok: false, error: generic.test(content.error) ? "Choose a content backup or an audio backup downloaded from Backup & Restore → Backup." : content.error };
}

export async function checkFiles(opened: OpenedFiles): Promise<MissingCheck> {
  return (await post("/api/content/missing-files/check", JSON.stringify({ kind: opened.kind, paths: [...opened.files.keys()] }), "application/json")) as MissingCheck;
}

export type PutBackResult = { ok: true; putBack: number; stillMissing: number } | { ok: false; putBack: number; error: string };

// One file at a time; a second run picks up where a stopped one ended (files put back are no longer missing).
export async function putBackFiles(opened: OpenedFiles, paths: string[], onProgress: Progress): Promise<PutBackResult> {
  let putBack = 0;
  for (const [index, path] of paths.entries()) {
    onProgress(`Putting back files: ${index + 1} of ${paths.length}…`);
    const bytes = opened.files.get(path);
    if (!bytes) return { ok: false, putBack, error: "The backup is damaged (a file is missing)." };
    const sent = (await post(`/api/content/missing-files/file?kind=${opened.kind}&path=${encodeURIComponent(path)}`, bytes, "application/octet-stream")) as
      | { ok: true; skipped: boolean }
      | { ok: false; error: string };
    if (!sent.ok) {
      await finish(opened.kind, putBack);
      return { ok: false, putBack, error: sent.error };
    }
    if (!sent.skipped) putBack++;
  }
  onProgress("Checking storage again…");
  const done = await finish(opened.kind, putBack);
  return done.ok ? { ok: true, putBack, stillMissing: done.stillMissing } : { ok: false, putBack, error: done.error };
}

async function finish(kind: FileKind, putBack: number) {
  return (await post("/api/content/missing-files/done", JSON.stringify({ kind, putBack }), "application/json")) as { ok: true; stillMissing: number } | { ok: false; error: string };
}

async function post(url: string, body: BodyInit | Uint8Array, type: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": type }, body: body as BodyInit });
    const result = (await response.json()) as { ok?: boolean; error?: string };
    return result.ok ? (result as { ok: true }) : { ...result, ok: false, error: result.error ?? NOT_THROUGH_MESSAGE };
  } catch {
    return { ok: false, error: NOT_THROUGH_MESSAGE };
  }
}
