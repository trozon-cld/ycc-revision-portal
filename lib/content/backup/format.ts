// The backup zip: manifest.json, one JSON file per part (rows of each table, as stored) and pictures/.
// Pure, safe in the browser and on the server. Restore (run 5b) reads the same shapes.

export const BACKUP_FORMAT = "ycc-backup";
export const BACKUP_VERSION = 1;

// Each part's tables, in the order a restore puts them back. General queries, support contact, audio,
// accounts, candidates' data and logs are never in a backup.
export const BACKUP_PARTS = {
  languages: ["voice_languages", "voice_phrases"],
  structure: ["test_areas", "sections", "chapters", "test_types", "test_type_chapters", "test_type_languages"],
  content: [
    "media",
    "content_pages",
    "content_page_media",
    "questions",
    "question_media",
    "handbook_items",
    "page_translations",
    "question_translations",
  ],
} as const;

export type BackupPart = keyof typeof BACKUP_PARTS;
export type BackupTable = (typeof BACKUP_PARTS)[BackupPart][number];
export const PICTURES_FOLDER = "pictures";

// What a backup holds, as shown to staff (after a backup, before and after a restore, and in the log).
export const BACKUP_COUNTS: { label: string; tables: BackupTable[] }[] = [
  { label: "Test areas", tables: ["test_areas"] },
  { label: "Test types", tables: ["test_types"] },
  { label: "Sections", tables: ["sections"] },
  { label: "Chapters", tables: ["chapters"] },
  { label: "Pages", tables: ["content_pages"] },
  { label: "Questions", tables: ["questions"] },
  { label: "Pictures", tables: ["media"] },
  { label: "Translations", tables: ["page_translations", "question_translations"] },
  { label: "Languages", tables: ["voice_languages"] },
];

// Rows per count, from a manifest's tables or a restore's result.
export function backupCounts(rows: (table: string) => number): { label: string; count: number }[] {
  return BACKUP_COUNTS.map(({ label, tables }) => ({ label, count: tables.reduce((sum, table) => sum + rows(table), 0) }));
}

// Rows exactly as stored (ids kept, so links, translations and Q numbers come back as they were).
export type BackupRow = Record<string, unknown>;

export type BackupManifest = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  createdBy: string;
  // Each table's columns and row count; a restore checks the columns match before reading anything.
  tables: Record<string, { columns: string[]; rows: number }>;
  pictures: { files: number; bytes: number };
};

// One stored picture file: where it goes in the zip, the picture's name, its size, and a short-lived link to fetch it.
export type BackupPictureFile = { zipPath: string; name: string; bytes: number | null; url: string };

// What /api/content/backup sends (gzipped JSON).
export type BackupData = {
  fileName: string;
  manifest: BackupManifest;
  parts: Record<BackupPart, Record<string, BackupRow[]>>;
  pictures: BackupPictureFile[];
};
