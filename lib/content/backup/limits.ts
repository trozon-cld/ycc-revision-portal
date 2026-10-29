// Backup and restore sizes, shared by the browser and the server.
// The largest backup zip the Restore page opens (it's read into the browser's memory).
export const MAX_BACKUP_ZIP_BYTES = 500 * 1024 * 1024;
// The restore's data (everything but the pictures), gzipped by the browser, and how big it may unpack to.
export const MAX_RESTORE_DATA_BYTES = 25 * 1024 * 1024;
export const MAX_RESTORE_JSON_BYTES = 250 * 1024 * 1024;
// The restore check: the manifest and the backup's test type ids.
export const MAX_RESTORE_CHECK_BYTES = 256 * 1024;
