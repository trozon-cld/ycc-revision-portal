import { gunzipSync, strToU8, strFromU8, zipSync, type Zippable } from "fflate";
import { NOT_THROUGH_MESSAGE } from "@/lib/forms";
import type { BackupData, BackupManifest, BackupPart } from "./format";

// Browser only: asks the server for the backup, fetches each picture by its short-lived link and builds the zip.

export type BuiltBackup = { ok: true; fileName: string; zip: Uint8Array; data: BackupData } | { ok: false; error: string };
type Progress = (step: string) => void;

const TRIES = 2;

export async function buildBackup(onProgress: Progress): Promise<BuiltBackup> {
  onProgress("Reading the portal's content…");
  const data = await requestData();
  if ("error" in data) return { ok: false, error: data.error };

  const files: Zippable = { "manifest.json": strToU8(JSON.stringify(data.manifest, null, 1)) };
  for (const part of Object.keys(data.parts) as BackupPart[]) files[`${part}.json`] = strToU8(JSON.stringify(data.parts[part]));

  for (const [index, picture] of data.pictures.entries()) {
    onProgress(`Fetching pictures: ${index + 1} of ${data.pictures.length}…`);
    const bytes = await fetchPicture(picture.url);
    if (!bytes || (picture.bytes !== null && bytes.length !== picture.bytes)) {
      return { ok: false, error: `A picture couldn't be fetched (${picture.name}). Check your connection and try again.` };
    }
    // Pictures are already compressed, so they're stored as they are.
    files[picture.zipPath] = [bytes, { level: 0 }];
  }

  onProgress("Building the zip…");
  return { ok: true, fileName: data.fileName, zip: zipSync(files, { level: 6 }), data };
}

async function requestData(): Promise<BackupData | { error: string }> {
  try {
    const response = await fetch("/api/content/backup", { method: "POST" });
    if (response.headers.get("content-type")?.includes("application/json")) {
      const result = (await response.json()) as { error?: string };
      return { error: result.error ?? NOT_THROUGH_MESSAGE };
    }
    if (!response.ok) return { error: NOT_THROUGH_MESSAGE };
    return JSON.parse(strFromU8(gunzipSync(new Uint8Array(await response.arrayBuffer())))) as BackupData;
  } catch {
    return { error: NOT_THROUGH_MESSAGE };
  }
}

async function fetchPicture(url: string): Promise<Uint8Array | null> {
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

// Tells the server the zip was built and saved, for the Activity log; false if that didn't go through.
export async function reportSaved(fileName: string, manifest: BackupManifest): Promise<boolean> {
  try {
    const response = await fetch("/api/content/backup/saved", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName, tables: manifest.tables }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
