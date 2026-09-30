"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LOGO } from "@/lib/brand";

type CoverImage = { src: string; alt: string; thumb?: string };

// The whole picture always shows; any room around it is filled with a blurred copy, so no picture
// shape leaves empty bars. With a small copy (`thumb`) that shows at once, blurred, and the full
// picture fades in over it when it has arrived. `blur` is in px, smaller for the admin's previews.
export function CoverPicture({
  picture,
  blur = 28,
  decorative = false,
  priority = false,
}: {
  picture: CoverImage;
  blur?: number;
  decorative?: boolean;
  priority?: boolean;
}) {
  const fullRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  // Already in the browser's cache (e.g. preloaded): it may have finished before React attached onLoad.
  useEffect(() => {
    const image = fullRef.current;
    if (image?.complete && image.naturalWidth > 0) setLoaded(true);
  }, [picture.src]);
  const fill = picture.thumb ?? picture.src;
  const showFull = loaded || !picture.thumb;
  return (
    <div className="relative size-full overflow-hidden bg-primary">
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link */}
      <img
        src={fill}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="absolute inset-0 size-full scale-110 object-cover opacity-85"
        style={{ filter: `blur(${blur}px)` }}
      />
      {picture.thumb && !loaded && (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link
        <img src={picture.thumb} alt="" aria-hidden="true" className="absolute inset-0 size-full object-contain blur-[3px]" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link */}
      <img
        ref={fullRef}
        src={picture.src}
        alt={decorative ? "" : picture.alt}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        onLoad={() => setLoaded(true)}
        className={`relative size-full object-contain transition-opacity duration-300 motion-reduce:transition-none ${showFull ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

// Sizes are in em, so the same cover works on a page and in a small preview (set its font size).
export function FrontCoverFace({
  categoryName,
  picture,
  blur,
  decorative,
}: {
  categoryName: string;
  picture: CoverImage | null;
  blur?: number;
  decorative?: boolean;
}) {
  if (picture) return <CoverPicture picture={picture} blur={blur} decorative={decorative} priority={!decorative} />;
  return (
    <div className="flex size-full flex-col bg-primary text-white">
      <div aria-hidden="true" className="h-[0.6em] shrink-0 bg-accent" />
      <div className="flex min-h-0 flex-1 flex-col justify-between gap-[1em] overflow-hidden p-[2em]">
        <Logo />
        <div className="min-w-0">
          <p className="text-[0.85em] font-semibold uppercase tracking-[0.18em] text-white/90">Revision Portal</p>
          <p className="mt-[0.2em] text-[2.6em] font-bold leading-tight">Handbook</p>
          <div aria-hidden="true" className="my-[0.9em] h-[0.3em] w-[4em] rounded-full bg-accent" />
          <p className="text-[1.5em] font-semibold leading-snug [overflow-wrap:anywhere]">{categoryName}</p>
        </div>
        <p className="text-[1em] leading-snug text-white/95">Designed to help you prepare with confidence.</p>
      </div>
    </div>
  );
}

export function BackCoverFace({
  categoryName,
  picture,
  blur,
  decorative,
  actions,
}: {
  categoryName: string;
  picture: CoverImage | null;
  blur?: number;
  decorative?: boolean;
  actions: ReactNode;
}) {
  return (
    <div className="flex size-full flex-col bg-white">
      <div className="min-h-0 flex-1">
        {picture ? (
          <CoverPicture picture={picture} blur={blur} decorative={decorative} />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-[1em] overflow-hidden bg-primary p-[2em] text-center text-white">
            <Logo centred />
            <p className="text-[1.3em] font-semibold leading-snug [overflow-wrap:anywhere]">{categoryName}</p>
            <p className="text-[1em] leading-snug text-white/95">Designed to help you prepare with confidence.</p>
          </div>
        )}
      </div>
      <div aria-hidden="true" className="h-[0.35em] shrink-0 bg-accent" />
      {/* Capped so large reader text doesn't squeeze the picture on short screens. */}
      <div className="shrink-0 px-[1.2em] py-[1em] text-center text-[min(1em,20px)] text-ink">
        <p className="text-[1.05em] font-semibold">You&apos;ve reached the end of the Handbook.</p>
        <div className="mt-[0.8em] flex flex-wrap justify-center gap-[0.6em]">{actions}</div>
      </div>
    </div>
  );
}

function Logo({ centred = false }: { centred?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small static logo, sized in em
    <img src={LOGO.src} alt="YCC" width={LOGO.width} height={LOGO.height} className={`h-[3em] w-auto rounded-[0.4em] ring-2 ring-white/60 ${centred ? "self-center" : "self-start"}`} />
  );
}
