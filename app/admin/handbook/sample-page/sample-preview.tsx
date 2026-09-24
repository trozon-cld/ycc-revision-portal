"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_TEXT_SIZE, TEXT_SIZES, type BookPageData, type ResolvedMedia, type TextSize } from "@/lib/content/book";
import { BookReader } from "@/components/learning/book-reader";
import { buttonClass } from "@/components/admin/styles";

const DEVICES = {
  phone: { label: "Phone", width: 390, height: 760 },
  tablet: { label: "Tablet", width: 820, height: 1000 },
  desktop: { label: "Desktop", width: 1280, height: 780 },
} as const;
type Device = keyof typeof DEVICES;

// Renders the reader at a real device size, scaled down to fit the admin page when needed.
export function SamplePreview({ pages, media }: { pages: BookPageData[]; media: ResolvedMedia }) {
  const [device, setDevice] = useState<Device>("desktop");
  const [textSize, setTextSize] = useState<TextSize>(DEFAULT_TEXT_SIZE);
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

  const frame = DEVICES[device];
  const scale = available.width ? Math.min(1, available.width / frame.width, available.height / frame.height) : 1;
  const sizeIndex = TEXT_SIZES.indexOf(textSize);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Screen size" className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
          {(Object.keys(DEVICES) as Device[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={device === key}
              onClick={() => setDevice(key)}
              className={`h-9 rounded px-3 text-sm font-medium sm:h-8 ${
                device === key ? "bg-primary text-white" : "text-ink hover:bg-slate-100"
              }`}
            >
              {DEVICES[key].label}
            </button>
          ))}
        </div>
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
        <p className="text-sm text-slate-600">
          {frame.width} × {frame.height}
          {scale < 1 && ` · shown at ${Math.round(scale * 100)}%`}
        </p>
      </div>

      <div ref={wrapperRef} className="w-full">
        <div
          className="overflow-hidden rounded-lg border border-slate-300"
          style={{ width: frame.width * scale, height: frame.height * scale }}
        >
          <div style={{ width: frame.width, height: frame.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <BookReader pages={pages} media={media} textSize={textSize} label="Sample Handbook pages" />
          </div>
        </div>
      </div>
    </div>
  );
}
