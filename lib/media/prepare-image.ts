// Browser-only: shrinks and converts a chosen picture to WebP before upload, so pages load fast.
// Quality is kept high enough that the change isn't visible at normal viewing size.

import { MAX_SOURCE_BYTES, MAX_UPLOAD_BYTES } from "./limits";

const MAX_EDGE = 2000;
const THUMB_EDGE = 400;
// Signs and diagrams (usually PNG) have hard edges, so they get a higher quality than photos.
const QUALITY_GRAPHIC = 0.92;
const QUALITY_PHOTO = 0.85;
const QUALITY_THUMB = 0.8;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export type PreparedImage = {
  main: File;
  thumb: File;
  width: number;
  height: number;
  originalBytes: number;
};

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED.includes(file.type)) throw new Error("Choose a PNG, JPEG or WebP picture.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("This picture is larger than 25 MB. Please choose a smaller one.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This picture couldn't be read. It may be damaged; try another file.");
  }

  try {
    const baseName = file.name.replace(/\.[^.]+$/, "") || "picture";
    const quality = file.type === "image/png" ? QUALITY_GRAPHIC : QUALITY_PHOTO;
    const main = await encode(bitmap, MAX_EDGE, quality);
    const thumb = await encode(bitmap, THUMB_EDGE, QUALITY_THUMB);

    // Keep the original if converting didn't help and it already fits the limits.
    const fitsAsIs = Math.max(bitmap.width, bitmap.height) <= MAX_EDGE && file.size <= MAX_UPLOAD_BYTES;
    const useOriginal = fitsAsIs && (main.blob.type !== "image/webp" || main.blob.size >= file.size);
    const mainFile = useOriginal ? file : toFile(main.blob, baseName);
    const size = useOriginal ? { width: bitmap.width, height: bitmap.height } : main;

    if (mainFile.size > MAX_UPLOAD_BYTES) {
      throw new Error("This picture is still larger than 5 MB after shrinking. Please choose a smaller one.");
    }
    return {
      main: mainFile,
      thumb: toFile(thumb.blob, `${baseName}-thumb`),
      width: size.width,
      height: size.height,
      originalBytes: file.size,
    };
  } finally {
    bitmap.close();
  }
}

async function encode(bitmap: ImageBitmap, maxEdge: number, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser couldn't process this picture.");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);

  let blob = await toBlob(canvas, "image/webp", quality);
  // Browsers without WebP encoding hand back PNG; use JPEG instead to keep the size down.
  if (blob.type !== "image/webp") {
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    blob = await toBlob(canvas, "image/jpeg", quality);
  }
  return { blob, width, height };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't convert the picture."))), type, quality)
  );
}

function toFile(blob: Blob, baseName: string) {
  const extension = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
  return new File([blob], `${baseName}.${extension}`, { type: blob.type });
}
