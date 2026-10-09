"use client";

import { useEffect, useState } from "react";
import type { PickerItem } from "@/app/admin/handbook/pages/actions";
import { Dialog } from "./dialog";
import { MediaUploadForm } from "./media-upload-form";
import { PICKER_LIMIT } from "@/lib/media/limits";
import { buttonClass, inputClass } from "./styles";

// Media library picker, shared by the page and question editors and the covers. `load` is a server action.
// "Upload new" adds a picture to the library without leaving the editor; it then shows selected, ready to use.
export function PicturePicker({
  load,
  storageReady,
  onPick,
  onClose,
  uploadHint,
}: {
  load: (search: string) => Promise<PickerItem[]>;
  storageReady: boolean;
  onPick: (item: PickerItem) => void;
  onClose: () => void;
  uploadHint?: string;
}) {
  const [tab, setTab] = useState<"library" | "upload">("library");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<PickerItem[] | null>(null);
  // The search the shown pictures are for; while it differs from the box, a search is running.
  const [shownSearch, setShownSearch] = useState("");
  const [failed, setFailed] = useState(false);
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const searching = items !== null && !failed && shownSearch !== search;
  const uploaded = uploadedId ? items?.find((item) => item.id === uploadedId) : undefined;

  function onUploaded(mediaId: string) {
    setUploadedId(mediaId);
    setSearch("");
    setItems(null);
    setReloads((count) => count + 1);
    setTab("library");
  }

  useEffect(() => {
    if (!storageReady) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await load(search);
        if (!cancelled) {
          setItems(result);
          setShownSearch(search);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, search ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load, search, storageReady, reloads]);

  const library = (
    <>
      <div className="space-y-3 px-5 py-4">
        {!storageReady ? (
          <p className="text-sm">Image storage isn&apos;t set up yet, so there are no pictures to choose from.</p>
        ) : (
          <>
            <label htmlFor="picker-search" className="sr-only">
              Search pictures
            </label>
            <input
              id="picker-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search descriptions or file names"
              className={inputClass}
            />
            {failed && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                Pictures couldn&apos;t be loaded. Try again in a moment.
              </p>
            )}
            {items === null && !failed && <p className="text-sm text-slate-600">Loading pictures…</p>}
            {searching && (
              <p role="status" className="text-sm text-slate-600">
                Searching…
              </p>
            )}
            {!searching && items?.length === 0 && (
              <p className="text-sm text-slate-700">
                {search ? "No pictures match your search." : "No pictures yet. Use Upload new to add one."}
              </p>
            )}
            {!searching && items && items.length >= PICKER_LIMIT && (
              <p className="text-sm text-slate-700">
                {search ? `Showing the first ${PICKER_LIMIT} matches. Add more words to narrow it down.` : `Showing the newest ${PICKER_LIMIT} pictures. Search to find older ones.`}
              </p>
            )}
            {items && items.length > 0 && (
              <ul aria-busy={searching || undefined} className={`grid grid-cols-2 gap-2 transition-opacity ${searching ? "opacity-50" : ""}`}>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onPick(item)}
                      aria-current={item.id === uploadedId ? "true" : undefined}
                      className={`flex w-full flex-col overflow-hidden rounded-md border bg-white text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        item.id === uploadedId ? "border-primary ring-2 ring-primary" : "border-slate-200"
                      }`}
                    >
                      <span className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100">
                        {item.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed thumbnail
                          <img src={item.thumbUrl} alt="" loading="lazy" decoding="async" className="size-full object-contain" />
                        ) : (
                          <span className="text-xs text-slate-600">No preview</span>
                        )}
                      </span>
                      {item.id === uploadedId && <span className="px-2 pt-1.5 text-xs font-semibold text-primary">Just uploaded · selected</span>}
                      <span className="line-clamp-2 px-2 py-1.5 text-xs text-ink [overflow-wrap:anywhere]">{item.alt}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {uploaded && (
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
          <button type="button" onClick={onClose} className={buttonClass("secondary")}>
            Cancel
          </button>
          <button type="button" onClick={() => onPick(uploaded)} className={buttonClass("primary")}>
            Use this picture
          </button>
        </div>
      )}
    </>
  );

  return (
    <Dialog
      title="Choose a picture"
      description={tab === "library" ? "From your Media library, newest first." : "Add it to your Media library, then use it here."}
      onClose={onClose}
    >
      {storageReady && (
        <div className="px-5 pt-4">
          <div role="group" aria-label="Picture source" className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
            {(["library", "upload"] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
                className={`h-10 rounded px-3 text-sm font-medium sm:h-8 ${tab === key ? "bg-primary text-white" : "text-ink hover:bg-slate-100"}`}
              >
                {key === "library" ? "Media library" : "Upload new"}
              </button>
            ))}
          </div>
        </div>
      )}
      {storageReady && tab === "upload" ? (
        <MediaUploadForm onCancel={() => setTab("library")} onUploaded={onUploaded} hint={uploadHint} />
      ) : (
        library
      )}
    </Dialog>
  );
}
