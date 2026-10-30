import { gunzipSync, gzipSync, strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { NOT_THROUGH_MESSAGE } from "@/lib/forms";
import { ZIP_JUNK } from "@/lib/content/import/zip";
import { AUDIO_BACKUP_FORMAT, AUDIO_FILES_FOLDER, AUDIO_TABLES, type AudioBackupData, type AudioBackupManifest, type AudioCheck, type AudioRestoreResult, type AudioRow, type AudioTable } from "./audio-format";
import { MAX_AUDIO_ZIP_BYTES } from "./limits";

// Browser only: one language's audio backup (build and save), and opening one to restore it (check, files, records).

export type BuiltAudioBackup = { ok: true; fileName: string; zip: Uint8Array; manifest: AudioBackupManifest } | { ok: false; error: string };
export type OpenedAudioBackup = { manifest: AudioBackupManifest; data: Record<AudioTable, AudioRow[]>; files: Map<string, Uint8Array> };
type Progress = (step: string) => void;

const TRIES = 2;

export async function buildAudioBackup(language: string, onProgress: Progress): Promise<BuiltAudioBackup> {
  onProgress("Reading the audio records…");
  const data = await requestData(language);
  if ("error" in data) return { ok: false, error: data.error };
  const files: Zippable = {
    "manifest.json": strToU8(JSON.stringify(data.manifest, null, 1)),
    "data.json": strToU8(JSON.stringify(data.data)),
  };
  for (const [index, file] of data.files.entries()) {
    onProgress(`Fetching audio files: ${index + 1} of ${data.files.length}…`);
    const bytes = await fetchFile(file.url);
    if (!bytes || bytes.length !== file.bytes) return { ok: false, error: "An audio file couldn't be fetched. Check your connection and try again." };
    // MP3s are already compressed, so they're stored as they are.
    files[file.zipPath] = [bytes, { level: 0 }];
  }
  onProgress("Building the zip…");
  return { ok: true, fileName: data.fileName, zip: zipSync(files, { level: 6 }), manifest: data.manifest };
}

// Tells the server the zip was built and saved, for the Activity log; false if that didn't go through.
export async function reportAudioSaved(fileName: string, manifest: AudioBackupManifest): Promise<boolean> {
  try {
    const response = await fetch("/api/content/audio-backup/saved", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName, manifest }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function openAudioZip(file: File): Promise<{ ok: true; backup: OpenedAudioBackup } | { ok: false; error: string }> {
  if (file.size > MAX_AUDIO_ZIP_BYTES) return { ok: false, error: `The audio backup must be ${MAX_AUDIO_ZIP_BYTES / 1024 / 1024} MB or smaller.` };
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (entry) => !ZIP_JUNK.test(entry.name) && !entry.name.endsWith("/") });
  } catch {
    return { ok: false, error: "This file couldn't be opened as a zip. Choose the audio backup exactly as it was downloaded." };
  }
  const found = Object.keys(entries).filter((name) => /^([^/]+\/)?manifest\.json$/.test(name));
  if (found.length !== 1) return { ok: false, error: "This isn't an audio backup (it has no manifest.json). Choose a file downloaded from Audio backups." };
  const root = found[0].slice(0, found[0].length - "manifest.json".length);
  const read = (name: string): unknown => {
    try {
      return JSON.parse(strFromU8(entries[root + name]));
    } catch {
      return undefined;
    }
  };
  const manifest = read("manifest.json") as AudioBackupManifest | undefined;
  if (!manifest || manifest.format !== AUDIO_BACKUP_FORMAT) {
    return { ok: false, error: "This isn't an audio backup. Choose a file downloaded from Audio backups (the main backup is restored above)." };
  }
  const data = read("data.json") as Record<AudioTable, AudioRow[]> | undefined;
  if (!data || !AUDIO_TABLES.every((table) => Array.isArray(data[table]))) return { ok: false, error: "The audio backup is damaged (data.json is missing or can't be read)." };

  const prefix = `${root}${AUDIO_FILES_FOLDER}/`;
  const files = new Map<string, Uint8Array>();
  for (const name of Object.keys(entries)) if (name.startsWith(prefix)) files.set(name.slice(prefix.length), entries[name]);
  const absent = AUDIO_TABLES.flatMap((table) => data[table]).filter((row) => !files.has(String(row.storage_path)));
  if (absent.length > 0) return { ok: false, error: `The audio backup is damaged: ${absent.length} of its audio files are missing from the zip.` };
  return { ok: true, backup: { manifest, data, files } };
}

// Which records this project can take back; nothing is uploaded yet.
export async function checkAudioBackup(backup: OpenedAudioBackup): Promise<AudioCheck> {
  return (await post("/api/content/audio-restore/check", records(backup), "application/gzip")) as AudioCheck;
}

// Uploads the files the check listed, then saves the records.
export async function runAudioRestore(backup: OpenedAudioBackup, paths: string[], onProgress: Progress): Promise<AudioRestoreResult> {
  for (const [index, path] of paths.entries()) {
    onProgress(`Uploading audio files: ${index + 1} of ${paths.length}…`);
    const bytes = backup.files.get(path);
    if (!bytes) return { ok: false, problems: ["The audio backup is damaged (an audio file is missing)."] };
    const sent = await post(`/api/content/audio-restore/file?path=${encodeURIComponent(path)}`, bytes, "application/octet-stream");
    if (!sent.ok) return { ok: false, problems: "problems" in sent ? sent.problems : [NOT_THROUGH_MESSAGE] };
  }
  onProgress("Saving the audio records…");
  return (await post("/api/content/audio-restore", records(backup), "application/gzip")) as AudioRestoreResult;
}

function records(backup: OpenedAudioBackup): Uint8Array {
  return gzipSync(strToU8(JSON.stringify({ manifest: backup.manifest, data: backup.data })));
}

async function requestData(language: string): Promise<AudioBackupData | { error: string }> {
  try {
    const response = await fetch("/api/content/audio-backup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language }),
    });
    if (response.headers.get("content-type")?.includes("application/json")) {
      const result = (await response.json()) as { error?: string };
      return { error: result.error ?? NOT_THROUGH_MESSAGE };
    }
    if (!response.ok) return { error: NOT_THROUGH_MESSAGE };
    return JSON.parse(strFromU8(gunzipSync(new Uint8Array(await response.arrayBuffer())))) as AudioBackupData;
  } catch {
    return { error: NOT_THROUGH_MESSAGE };
  }
}

async function fetchFile(url: string): Promise<Uint8Array | null> {
  for (let attempt = 0; attempt < TRIES; attempt++) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
    } catch {
      // Tried again below; a second failure stops the backup.
    }
  }
  return null;
}

async function post(url: string, body: Uint8Array, type: string): Promise<{ ok: true; [key: string]: unknown } | { ok: false; problems: string[] }> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": type }, body: body as BodyInit });
    const result = (await response.json()) as { ok?: boolean; problems?: string[]; error?: string };
    if (result.ok) return result as { ok: true };
    return { ok: false, problems: result.problems ?? [result.error ?? NOT_THROUGH_MESSAGE] };
  } catch {
    return { ok: false, problems: [NOT_THROUGH_MESSAGE] };
  }
}
