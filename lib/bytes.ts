// The letters at a place in a file's bytes (file signatures such as "RIFF", "WAVE", "IHDR").
export function asciiAt(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
