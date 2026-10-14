// Shared by the browser (before upload) and the server (after upload).
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_THUMB_BYTES = 1024 * 1024;
// Uploads stop once pictures and archives reach this (the free storage quota is 1 GB), so storage can't be filled.
export const STORAGE_LIMIT_BYTES = 900 * 1024 * 1024;
// The largest upload request accepted: the picture, its thumbnail and the form's few fields.
export const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_BYTES + MAX_THUMB_BYTES + 64 * 1024;
// The picture picker shows at most this many (newest first, or the first matches of a search).
export const PICKER_LIMIT = 60;
