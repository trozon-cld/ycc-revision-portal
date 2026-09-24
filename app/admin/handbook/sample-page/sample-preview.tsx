"use client";

import type { BookPageData, ResolvedMedia } from "@/lib/content/book";
import { BookPreview } from "@/components/admin/book-preview";

export function SamplePreview({ pages, media }: { pages: BookPageData[]; media: ResolvedMedia }) {
  return <BookPreview pages={pages} media={media} label="Sample Handbook pages" />;
}
