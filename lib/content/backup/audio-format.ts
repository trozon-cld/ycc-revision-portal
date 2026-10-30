// The audio backup file (one language), shared by the browser and the server: manifest.json, data.json (the audio
// records) and audio/<storage path> for each MP3.

export const AUDIO_BACKUP_FORMAT = "ycc-audio";
export const AUDIO_BACKUP_VERSION = 1;
export const AUDIO_FILES_FOLDER = "audio";
export const AUDIO_TABLES = ["page_audio", "question_audio"] as const;
export type AudioTable = (typeof AUDIO_TABLES)[number];
export type AudioRow = Record<string, unknown>;

export type AudioBackupManifest = {
  format: typeof AUDIO_BACKUP_FORMAT;
  version: number;
  language: { code: string; name: string };
  createdAt: string;
  createdBy: string;
  pages: number;
  questions: number;
  bytes: number;
};
// What the server sends for a backup: the records and a short-lived link to each file.
export type AudioBackupData = {
  fileName: string;
  manifest: AudioBackupManifest;
  data: Record<AudioTable, AudioRow[]>;
  files: { zipPath: string; bytes: number; url: string }[];
};
export type AudioLanguageRow = { code: string; name: string; pages: number; questions: number; bytes: number };
export type AudioCheck =
  | { ok: true; language: string; paths: string[]; skipped: string[]; skippedCount: number }
  | { ok: false; problems: string[] };
export type AudioRestoreResult = { ok: true; restored: number; skipped: number; notStored: number } | { ok: false; problems: string[] };
