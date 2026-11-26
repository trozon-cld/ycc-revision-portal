"use client";

import type { BookPageData, ResolvedMedia } from "@/lib/content/book";
import type { BookCovers } from "@/lib/content/covers";
import { BookPreview } from "@/components/admin/book-preview";

export function PreviewReader({ pages, media, covers }: { pages: BookPageData[]; media: ResolvedMedia; covers?: BookCovers }) {
  return (
    <BookPreview pages={pages} media={media} label="Book Preview" initialDevice="full" readerTools allowFullWindow covers={covers} />
  );
}
