"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_TEXT_SIZE, TEXT_SIZES, type BookPageData, type ResolvedMedia, type TextSize } from "@/lib/content/book";
import { BookReader, type LayoutInfo } from "@/components/learning/book-reader";
import { buttonClass } from "./styles";

export const DEVICES = {
  phone: { label: "Phone", width: 390, height: 760 },
  tablet: { label: "Tablet", width: 820, height: 1000 },
  desktop: { label: "Desktop", width: 1280, height: 780 },
} as const;
export type PreviewDevice = keyof typeof DEVICES;

export type ReadoutInfo = {
  pages: number;
  device: string;
  textSize: TextSize;
  // At the standard size: the smallest text any page was fitted to, and whether one still doesn't fit.
  smallest: number;
  tooLong: boolean;
};

// The editors' line under the preview: whether the page or question fits one page on this screen.
export function FitReadout({ info, noun, hint }: { info: ReadoutInfo; noun: "page" | "question"; hint: string }) {
  const { pages, device, textSize, smallest, tooLong } = info;
  const screen = device.toLowerCase();
  if (textSize !== DEFAULT_TEXT_SIZE) {
    return (
      <p className="text-slate-700">
        On {screen} at {textSize} px, this {noun} takes {pages} page{pages === 1 ? "" : "s"}.
      </p>
    );
  }
  if (tooLong) {
    return (
      <p className="font-medium text-amber-900">
        {noun === "question"
          ? `Too long for one ${screen} page once the answer is checked: the explanation continues on the next page. `
          : `Too long for one ${screen} page at the standard text size (${pages} pages). `}
        {hint}
      </p>
    );
  }
  return (
    <p className="text-slate-700">
      Fits on one {screen} page{smallest < textSize ? ` (text slightly smaller: ${smallest} px)` : ""}.
    </p>
  );
}

// Admin tool: the real candidate reader at a real device size, scaled down to fit when needed.
export function BookPreview({
  pages,
  media,
  label,
  initialDevice = "desktop",
  devices = ["phone", "tablet", "desktop"],
  readout,
  device: controlledDevice,
  onDeviceChange,
  textSize: controlledTextSize,
  onTextSizeChange,
  readerTools = false,
  allowFullWindow = false,
}: {
  pages: BookPageData[];
  media: ResolvedMedia;
  label: string;
  initialDevice?: PreviewDevice | "full";
  devices?: PreviewDevice[];
  readout?: (info: ReadoutInfo) => ReactNode;
  // Optional: the host keeps screen and text size (the question preview shares them across modes).
  device?: PreviewDevice;
  onDeviceChange?: (device: PreviewDevice) => void;
  textSize?: TextSize;
  onTextSizeChange?: (size: TextSize) => void;
  // The reader shows its own bar (Contents, Go to page, A−/A+), so the admin text size buttons go.
  readerTools?: boolean;
  // Adds "Full window": the reader fills the space below the toolbar.
  allowFullWindow?: boolean;
}) {
  const [ownDevice, setOwnDevice] = useState<PreviewDevice | "full">(initialDevice);
  const [ownTextSize, setOwnTextSize] = useState<TextSize>(DEFAULT_TEXT_SIZE);
  const device = controlledDevice ?? ownDevice;
  const textSize = controlledTextSize ?? ownTextSize;
  const setDevice = (onDeviceChange ?? setOwnDevice) as (device: PreviewDevice | "full") => void;
  const setTextSize = onTextSizeChange ?? setOwnTextSize;
  const [layout, setLayout] = useState<LayoutInfo | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    // Fit the frame in the space left below the toolbar, so the whole device is visible at once.
    const measure = () =>
      setAvailable({
        width: wrapper.clientWidth,
        height: Math.max(320, window.innerHeight - wrapper.getBoundingClientRect().top - 24),
      });
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const onLayout = useCallback((info: LayoutInfo) => setLayout(info), []);

  const frame =
    device === "full" ? { label: "Full window", width: Math.max(320, available.width), height: Math.max(560, available.height) } : DEVICES[device];
  const scale = device === "full" || !available.width ? 1 : Math.min(1, available.width / frame.width, available.height / frame.height);
  const sizeIndex = TEXT_SIZES.indexOf(textSize);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {devices.length > 1 && (
          <div role="group" aria-label="Screen size" className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
            {[...devices, ...(allowFullWindow ? (["full"] as const) : [])].map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={device === key}
                onClick={() => setDevice(key)}
                className={`h-9 rounded px-3 text-sm font-medium sm:h-8 ${
                  device === key ? "bg-primary text-white" : "text-ink hover:bg-slate-100"
                }`}
              >
                {key === "full" ? "Full window" : DEVICES[key].label}
              </button>
            ))}
          </div>
        )}
        {!readerTools && (
          <div role="group" aria-label="Text size" className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTextSize(TEXT_SIZES[Math.max(0, sizeIndex - 1)])}
              disabled={sizeIndex === 0}
              aria-label="Smaller text"
              className={buttonClass("secondary", "sm")}
            >
              A−
            </button>
            <span className="w-14 text-center text-sm text-slate-700">{textSize} px</span>
            <button
              type="button"
              onClick={() => setTextSize(TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, sizeIndex + 1)])}
              disabled={sizeIndex === TEXT_SIZES.length - 1}
              aria-label="Larger text"
              className={buttonClass("secondary", "sm")}
            >
              A+
            </button>
          </div>
        )}
        <p className="text-sm text-slate-600">
          {frame.width} × {frame.height}
          {scale < 1 && ` · shown at ${Math.round(scale * 100)}%`}
        </p>
      </div>

      {readout && layout !== null && (
        <div aria-live="polite" className="text-sm">
          {readout({
            pages: layout.pages,
            device: frame.label,
            textSize,
            smallest: Math.min(...layout.sizes, textSize),
            tooLong: layout.tooLong.some(Boolean),
          })}
        </div>
      )}

      <div ref={wrapperRef} className="w-full">
        <div
          className="overflow-hidden rounded-lg border border-slate-300"
          style={{ width: frame.width * scale, height: frame.height * scale }}
        >
          <div style={{ width: frame.width, height: frame.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <BookReader
              pages={pages}
              media={media}
              textSize={textSize}
              label={label}
              onLayout={onLayout}
              tools={readerTools}
              onTextSizeChange={readerTools ? setTextSize : undefined}
              resultsNote={readerTools ? "Preview only: these results aren't saved." : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
