"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/action-form";
import { PicturePicker } from "@/components/admin/picture-picker";
import { buttonClass } from "@/components/admin/styles";
import { BackCoverFace, FrontCoverFace } from "@/components/learning/book-covers";
import { COVER_MIN_HEIGHT, COVER_MIN_WIDTH, coverAdvice } from "@/lib/content/covers";
import { listPickerMedia, type PickerItem } from "@/app/admin/handbook/pages/actions";
import { saveCategoryCovers } from "./actions";

export type CoverChoice = PickerItem;
type Side = "front" | "back";

// Page shapes (width / height) and widths in em that the reader typically has on each kind of screen.
const FRAMES = [
  { label: "Laptop", ratio: 0.95, ems: 41 },
  { label: "Tablet", ratio: 0.8, ems: 48 },
  { label: "Phone", ratio: 0.6, ems: 23 },
] as const;
const FRAME_HEIGHT = 128;

export function CategoryCoversForm({
  categoryId,
  categoryName,
  initialFront,
  initialBack,
  storageReady,
  onClose,
}: {
  categoryId: string;
  categoryName: string;
  initialFront: CoverChoice | null;
  initialBack: CoverChoice | null;
  storageReady: boolean;
  onClose: () => void;
}) {
  const [covers, setCovers] = useState<Record<Side, CoverChoice | null>>({ front: initialFront, back: initialBack });
  const [picking, setPicking] = useState<Side | null>(null);

  return (
    <>
      <ActionForm
        action={saveCategoryCovers}
        hidden={{ categoryId, frontMediaId: covers.front?.id ?? "", backMediaId: covers.back?.id ?? "" }}
        submitLabel="Save covers"
        successMessage="Covers saved."
        onSuccess={onClose}
        onCancel={onClose}
      >
        <p className="text-sm text-slate-700">
          Use portrait pictures shaped like a book page (3:4), at least {COVER_MIN_WIDTH} × {COVER_MIN_HEIGHT} pixels. Upload
          them on the Media page first. The whole picture always shows; any space around it is filled with a blurred copy.
        </p>
        {(["front", "back"] as const).map((side) => (
          <CoverSlot
            key={side}
            side={side}
            categoryName={categoryName}
            choice={covers[side]}
            onChoose={() => setPicking(side)}
            onClear={() => setCovers((current) => ({ ...current, [side]: null }))}
          />
        ))}
      </ActionForm>
      {picking && (
        <PicturePicker
          load={listPickerMedia}
          storageReady={storageReady}
          onPick={(item) => {
            setCovers((current) => ({ ...current, [picking]: item }));
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}

function CoverSlot({
  side,
  categoryName,
  choice,
  onChoose,
  onClear,
}: {
  side: Side;
  categoryName: string;
  choice: CoverChoice | null;
  onChoose: () => void;
  onClear: () => void;
}) {
  const title = side === "front" ? "Front cover" : "Back cover";
  const advice = choice ? coverAdvice(choice.width, choice.height) : [];
  const picture = choice?.thumbUrl ? { src: choice.thumbUrl, alt: choice.alt } : null;

  return (
    <fieldset className="space-y-3 rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold text-ink">{title}</legend>
      <p className="text-sm text-slate-700 [overflow-wrap:anywhere]">
        {choice ? (
          <>
            <span className="font-medium text-ink">{choice.name}</span> · {choice.width} × {choice.height}
          </>
        ) : (
          "Standard cover: the logo and the category name in brand colours."
        )}
      </p>

      <div aria-hidden="true" className="flex items-end gap-3">
        {FRAMES.map((frame) => {
          const width = Math.round(FRAME_HEIGHT * frame.ratio);
          const showPicture = choice ? picture : null;
          return (
            <div key={frame.label} className="text-center">
              <div
                className="overflow-hidden rounded-sm shadow ring-1 ring-slate-300"
                style={{ width, height: FRAME_HEIGHT, fontSize: width / frame.ems }}
              >
                {choice && !picture ? (
                  <span className="flex size-full items-center justify-center bg-slate-100 text-xs text-slate-600">No preview</span>
                ) : side === "front" ? (
                  <FrontCoverFace categoryName={categoryName} picture={showPicture} blur={5} decorative />
                ) : (
                  <BackCoverFace
                    categoryName={categoryName}
                    picture={showPicture}
                    blur={5}
                    decorative
                    actions={
                      <>
                        <span className="h-[3em] w-[9em] rounded-[0.5em] bg-primary" />
                        <span className="h-[3em] w-[11em] rounded-[0.5em] border-[0.15em] border-ink/30" />
                      </>
                    }
                  />
                )}
              </div>
              <span className="mt-1 block text-xs text-slate-600">{frame.label}</span>
            </div>
          );
        })}
      </div>

      {advice.map((line) => (
        <p key={line} className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-600/25">
          {line}
        </p>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onChoose} className={buttonClass("secondary")}>
          {choice ? "Change picture" : "Choose picture"}
        </button>
        {choice && (
          <button type="button" onClick={onClear} className={buttonClass("ghost")}>
            Use standard cover
          </button>
        )}
      </div>
    </fieldset>
  );
}
