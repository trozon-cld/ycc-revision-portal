"use client";

import { useEffect, useState } from "react";
import type { PickerItem } from "@/app/admin/handbook/pages/actions";
import { Dialog } from "./dialog";
import { PICKER_LIMIT } from "@/lib/media/limits";
import { inputClass } from "./styles";

// Media library picker, shared by the page and question editors. `load` is a server action.
export function PicturePicker({
  load,
  storageReady,
  onPick,
  onClose,
}: {
  load: (search: string) => Promise<PickerItem[]>;
  storageReady: boolean;
  onPick: (item: PickerItem) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<PickerItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!storageReady) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await load(search);
        if (!cancelled) {
          setItems(result);
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
  }, [load, search, storageReady]);

  return (
    <Dialog title="Choose a picture" description="From your Media library, newest first." onClose={onClose}>
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
            {items?.length === 0 && (
              <p className="text-sm text-slate-700">
                {search ? "No pictures match your search." : "No pictures yet. Upload them on the Media page first."}
              </p>
            )}
            {items && items.length >= PICKER_LIMIT && (
              <p className="text-sm text-slate-700">
                {search ? `Showing the first ${PICKER_LIMIT} matches. Add more words to narrow it down.` : `Showing the newest ${PICKER_LIMIT} pictures. Search to find older ones.`}
              </p>
            )}
            {items && items.length > 0 && (
              <ul className="grid grid-cols-2 gap-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onPick(item)}
                      className="flex w-full flex-col overflow-hidden rounded-md border border-slate-200 bg-white text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <span className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100">
                        {item.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed thumbnail
                          <img src={item.thumbUrl} alt="" className="size-full object-contain" />
                        ) : (
                          <span className="text-xs text-slate-600">No preview</span>
                        )}
                      </span>
                      <span className="line-clamp-2 px-2 py-1.5 text-xs text-ink [overflow-wrap:anywhere]">{item.alt}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
