"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaUploadState } from "@/lib/media/upload";
import { NOT_THROUGH_MESSAGE } from "@/lib/forms";
import { prepareImage, type PreparedImage } from "@/lib/media/prepare-image";
import { formatBytes } from "@/lib/format";
import { ALT_TEXT_MAX_LENGTH } from "@/lib/limits";
import { ActionForm } from "./action-form";
import { Field } from "./field";
import { fileInputClass, textareaClass } from "./styles";

type Selection =
  | { status: "empty" }
  | { status: "preparing" }
  | { status: "ready"; image: PreparedImage; originalName: string; previewUrl: string }
  | { status: "error"; message: string };

// The upload form, shared by the Media page and the picture picker's "Upload new" tab.
// Shared with the Media page's Edit description panel.
export const DESCRIPTION_HINT =
  "Say what the picture shows, in plain words. It's read aloud to people who can't see it, and by Listen for picture answers without a label, so don't hint at the right answer.";

export function MediaUploadForm({
  onCancel,
  onUploaded,
  hint,
}: {
  onCancel: () => void;
  onUploaded: (mediaId: string) => void;
  // Extra guidance for where the picture is going (e.g. cover sizes).
  hint?: string;
}) {
  const uploaded = useRef("");
  const [selection, setSelection] = useState<Selection>({ status: "empty" });
  const previewUrl = selection.status === "ready" ? selection.previewUrl : null;

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function onFileChange(file: File | undefined) {
    if (!file) {
      setSelection({ status: "empty" });
      return;
    }
    setSelection({ status: "preparing" });
    try {
      const image = await prepareImage(file);
      setSelection({ status: "ready", image, originalName: file.name, previewUrl: URL.createObjectURL(image.thumb) });
    } catch (error) {
      setSelection({ status: "error", message: error instanceof Error ? error.message : "This picture couldn't be read." });
    }
  }

  async function submit(_prev: MediaUploadState, formData: FormData): Promise<MediaUploadState> {
    if (selection.status === "preparing") return { error: "The picture is still being prepared. Try again in a moment." };
    if (selection.status !== "ready") return { error: "Choose a picture to upload." };
    formData.set("file", selection.image.main);
    formData.set("thumb", selection.image.thumb);
    formData.set("originalName", selection.originalName);
    const result = await sendUpload(formData);
    if (result.mediaId) uploaded.current = result.mediaId;
    return result;
  }

  return (
    <ActionForm action={submit} submitLabel="Upload" pendingLabel="Uploading…" successMessage="Picture uploaded." onSuccess={() => onUploaded(uploaded.current)} onCancel={onCancel}>
      {hint && <p className="text-sm text-slate-700">{hint}</p>}
      <Field id="media-file" label="Picture" hint="PNG, JPEG or WebP. It's shrunk and converted to WebP before uploading.">
        <input
          id="media-file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
          onChange={(event) => onFileChange(event.target.files?.[0])}
          className={fileInputClass}
        />
      </Field>

      <div aria-live="polite">
        {selection.status === "preparing" && <p className="text-sm text-slate-600">Preparing picture…</p>}
        {selection.status === "error" && (
          <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-strong">
            {selection.message}
          </p>
        )}
        {selection.status === "ready" && (
          <div className="flex items-center gap-3 rounded-md border border-slate-200 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview (blob: URL) before upload */}
            <img src={selection.previewUrl} alt="" className="size-20 shrink-0 rounded bg-slate-100 object-contain" />
            <p className="min-w-0 text-sm text-slate-600">
              <span className="block font-medium text-ink">
                {selection.image.width} × {selection.image.height}
              </span>
              {formatBytes(selection.image.originalBytes)} → {formatBytes(selection.image.main.size)}{" "}
              {selection.image.main.type === "image/webp" ? "WebP" : "(kept as it was)"}
            </p>
          </div>
        )}
      </div>

      <Field
        id="media-alt"
        label="Description"
        hint={DESCRIPTION_HINT}
      >
        <textarea id="media-alt" name="altText" required maxLength={ALT_TEXT_MAX_LENGTH} rows={3} className={textareaClass} />
      </Field>
    </ActionForm>
  );
}

// Its own address (app/api/media/upload/route.ts), as pictures are bigger than other requests may be.
async function sendUpload(formData: FormData): Promise<MediaUploadState> {
  try {
    const response = await fetch("/api/media/upload", { method: "POST", body: formData });
    const result = (await response.json()) as MediaUploadState;
    return result.error || result.success ? result : { error: NOT_THROUGH_MESSAGE };
  } catch {
    return { error: NOT_THROUGH_MESSAGE };
  }
}
