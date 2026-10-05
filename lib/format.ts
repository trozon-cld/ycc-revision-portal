// Small display helpers with no imports, safe on the server and in the browser.

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// "23 minutes 10 seconds", "45 minutes", "40 seconds".
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const parts = [minutes > 0 && countOf(minutes, "minute"), (rest > 0 || minutes === 0) && countOf(rest, "second")];
  return parts.filter(Boolean).join(" ");
}

// "1 chapter", "3 chapters"; pass the plural when it isn't just an added "s" ("categories").
export function countOf(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
