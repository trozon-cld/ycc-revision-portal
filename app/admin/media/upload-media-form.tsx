"use client";

import { useRouter } from "next/navigation";
import { MediaUploadForm } from "@/components/admin/media-upload-form";
import { PanelButton } from "@/components/admin/row-actions";
import { buttonClass } from "@/components/admin/styles";

export function UploadMediaButton({ configured }: { configured: boolean }) {
  const router = useRouter();
  return (
    <PanelButton label="Upload picture" title="Upload picture">
      {(close) =>
        configured ? (
          <MediaUploadForm
            onCancel={close}
            onUploaded={() => {
              close();
              // The upload went to its own address, so the list is fetched again here.
              router.refresh();
            }}
          />
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
