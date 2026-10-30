import { gzipSync, strFromU8, strToU8, unzipSync } from "fflate";
import { NOT_THROUGH_MESSAGE } from "@/lib/forms";
import { ZIP_JUNK } from "@/lib/content/import/zip";
import { BACKUP_FORMAT, BACKUP_PARTS, PICTURES_FOLDER, type BackupManifest, type BackupPart, type BackupRow } from "./format";
import { MAX_BACKUP_ZIP_BYTES } from "./limits";

// Browser only: opens a backup zip in memory, then restores it in three steps (check, pictures, data).

export type OpenedBackup = {
  manifest: BackupManifest;
  parts: Record<BackupPart, Record<string, BackupRow[]>>;
  // Stored picture files by their storage path (media/…).
  pictures: Map<string, Uint8Array>;
};
export type RestoreOutcome = { ok: true; tables: Record<string, number> } | { ok: false; problems: string[] };
type Progress = (step: string) => void;

export async function openBackupZip(file: File): Promise<{ ok: true; backup: OpenedBackup } | { ok: false; error: string }> {
  if (file.size > MAX_BACKUP_ZIP_BYTES) return { ok: false, error: `The backup must be ${MAX_BACKUP_ZIP_BYTES / 1024 / 1024} MB or smaller.` };
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (entry) => !ZIP_JUNK.test(entry.name) && !entry.name.endsWith("/") });
  } catch {
    return { ok: false, error: "This file couldn't be opened as a zip. Choose the backup file exactly as it was downloaded." };
  }
  // manifest.json at the top, or inside one folder (if the backup was unzipped and zipped again).
  const found = Object.keys(entries).filter((name) => /^([^/]+\/)?manifest\.json$/.test(name));
  if (found.length !== 1) return { ok: false, error: "This isn't a backup file (it has no manifest.json). Choose a file downloaded from Backup." };
  const root = found[0].slice(0, found[0].length - "manifest.json".length);

  const read = (name: string): unknown => {
    const data = entries[root + name];
    if (!data) return undefined;
    try {
      return JSON.parse(strFromU8(data));
    } catch {
      return undefined;
    }
  };
  const manifest = read("manifest.json") as BackupManifest | undefined;
  if (!manifest || manifest.format !== BACKUP_FORMAT) return { ok: false, error: "This isn't a backup file. Choose a file downloaded from Backup." };
  const parts = {} as OpenedBackup["parts"];
  for (const part of Object.keys(BACKUP_PARTS) as BackupPart[]) {
    const value = read(`${part}.json`);
    if (!value || typeof value !== "object") return { ok: false, error: `The backup is damaged (${part}.json is missing or can't be read).` };
    parts[part] = value as Record<string, BackupRow[]>;
  }

  const prefix = `${root}${PICTURES_FOLDER}/`;
  const pictures = new Map<string, Uint8Array>();
  for (const name of Object.keys(entries)) if (name.startsWith(prefix)) pictures.set(name.slice(prefix.length), entries[name]);
  const media = Array.isArray(parts.content.media) ? parts.content.media : [];
  const absent = media.filter((row) => !pictures.has(String(row.storage_path)) || !pictures.has(String(row.thumb_path)));
  if (absent.length > 0) return { ok: false, error: `The backup is damaged: ${absent.length} of its pictures are missing from the zip (${String(absent[0].original_name)}…).` };
  return { ok: true, backup: { manifest, parts, pictures } };
}

// Asks the server whether this project can take the backup; problems are shown before anything is uploaded.
export async function checkBackup(backup: OpenedBackup): Promise<RestoreOutcome | { ok: true }> {
  const testTypeIds = (backup.parts.structure.test_types ?? []).map((row) => String(row.id));
  return post("/api/content/restore/check", JSON.stringify({ manifest: backup.manifest, testTypeIds, pictureBytes: backup.manifest.pictures.bytes }), "application/json");
}

export async function runRestore(backup: OpenedBackup, onProgress: Progress): Promise<RestoreOutcome> {
  const files = [...backup.pictures.entries()];
  for (const [index, [path, data]] of files.entries()) {
    onProgress(`Uploading pictures: ${index + 1} of ${files.length}…`);
    const sent = await post(`/api/content/restore/picture?path=${encodeURIComponent(path)}`, data, "application/octet-stream");
    if (!sent.ok) return sent;
  }
  onProgress("Saving everything else…");
  const data = gzipSync(strToU8(JSON.stringify({ manifest: backup.manifest, parts: backup.parts })));
  return (await post("/api/content/restore", data, "application/gzip")) as RestoreOutcome;
}

async function post(url: string, body: BodyInit | Uint8Array, type: string): Promise<{ ok: true; tables?: Record<string, number> } | { ok: false; problems: string[] }> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": type }, body: body as BodyInit });
    const result = (await response.json()) as { ok?: boolean; problems?: string[]; error?: string; tables?: Record<string, number> };
    if (result.ok) return { ok: true, tables: result.tables };
    return { ok: false, problems: result.problems ?? [result.error ?? NOT_THROUGH_MESSAGE] };
  } catch {
    return { ok: false, problems: [NOT_THROUGH_MESSAGE] };
  }
}
