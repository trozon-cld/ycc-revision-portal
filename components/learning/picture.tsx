import type { PictureAlign, PictureSize } from "@/lib/content/blocks";
import type { ResolvedMedia } from "@/lib/content/book";
import { InlineText } from "./inline-text";
import { usePictureSrc } from "./measuring";

// Shared by Handbook picture blocks and question pictures, so both size the same way.
export function BookPicture({
  picture,
  size = "full",
  align = "center",
  caption,
}: {
  picture: ResolvedMedia[string] | undefined;
  size?: PictureSize;
  align?: PictureAlign;
  caption?: string;
}) {
  const src = usePictureSrc(picture?.src);
  const ratio = picture ? picture.width / picture.height : 4 / 3;
  const margin = align === "left" ? "mr-auto" : align === "right" ? "ml-auto" : "mx-auto";
  return (
    <figure className={`mb-[0.9em] [break-inside:avoid] ${margin}`} style={fitToSheet(ratio, size)}>
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link; files are pre-shrunk WebP
        <img
          src={src}
          alt={picture.alt}
          width={picture.width}
          height={picture.height}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full rounded-md"
          style={{ aspectRatio: String(ratio) }}
        />
      ) : (
        <div
          className="flex w-full items-center justify-center rounded-md bg-slate-100 text-[0.85em] text-slate-700"
          style={{ aspectRatio: String(ratio) }}
        >
          Picture unavailable
        </div>
      )}
      {caption && (
        <figcaption className="mt-[0.4em] text-center text-[0.85em] leading-snug text-slate-700">
          <InlineText text={caption} />
        </figcaption>
      )}
    </figure>
  );
}

const SIZE_SHARE: Record<PictureSize, string> = { small: "33.333%", medium: "50%", large: "75%", full: "100%" };

// Size comes from the known aspect ratio, never from the loaded file, so pages are counted the
// same before and after pictures arrive. Capped by the chosen size and the sheet height.
export function fitToSheet(ratio: number, size: PictureSize) {
  return { width: `min(${SIZE_SHARE[size]}, calc(var(--book-picture-max, 60vh) * ${ratio.toFixed(4)}))` };
}
