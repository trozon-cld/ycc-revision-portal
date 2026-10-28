// Bulk upload limits, shared by the browser (before sending) and the server (when checking).
export const MAX_BATCH_ZIP_BYTES = 100 * 1024 * 1024;
export const MAX_BATCH_ITEMS = 2000;
export const MAX_BATCH_PICTURES = 500;
// content.json plus the picture list: far above a whole PDF's text, well below what a server should read at once.
export const MAX_CHECK_REQUEST_BYTES = 5 * 1024 * 1024;
export const MAX_REPORTED_ISSUES = 200;
