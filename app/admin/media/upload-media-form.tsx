"use client";

import { useEffect, useState } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { Field } from "@/components/admin/field";
import { PanelButton } from "@/components/admin/row-actions";
import { buttonClass, fileInputClass, textareaClass } from "@/components/admin/styles";
import { prepareImage, type PreparedImage } from "@/lib/media/prepare-image";
import { uploadMedia, type MediaActionState } from "./actions";

export function UploadMediaButton({ configured }: { configured: boolean }) {
  return (
    <PanelButton label="Upload picture" title="Upload picture">
      {(close) =>
        configured ? (
          <UploadMediaForm onClose={close} />
        ) : (
          <div>
            <p className="px-5 py-4 text-sm">
              Image storage isn&apos;t set up yet. Add the Supabase settings to the server&apos;s environment first.
            </p>
            <div className="flex justify-end border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={close} className={buttonClass("secondary")}>
                Close
              </button>
            </div>
          </div>
        )
      }
    </PanelButton>
  );
}

type Selection =
  | { status: "empty" }
  | { status: "preparing" }
  | { status: "ready"; image: PreparedImage; originalName: string; previewUrl: string }
  | { status: "error"; message: string };

function UploadMediaForm({ onClose }: { onClose: () => void }) {
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

  async function submit(prev: MediaActionState, formData: FormData): Promise<MediaActionState> {
    if (selection.status === "preparing") return { error: "The picture is still being prepared. Try again in a moment." };
    if (selection.status !== "ready") return { error: "Choose a picture to upload." };
    formData.set("file", selection.image.main);
    formData.set("thumb", selection.image.thumb);
    formData.set("originalName", selection.originalName);
    return uploadMedia(prev, formData);
  }

  return (
    <ActionForm action={submit} submitLabel="Upload" pendingLabel="Uploading…" successMessage="Picture uploaded." onSuccess={onClose} onCancel={onClose}>
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
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
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
        hint="Say what the picture shows, in plain words. It's read aloud to people who can't see it."
      >
        <textarea id="media-alt" name="altText" required maxLength={300} rows={3} className={textareaClass} />
      </Field>
    </ActionForm>
  );
}

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
