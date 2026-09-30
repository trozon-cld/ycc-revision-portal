"use client";

import { useRouter } from "next/navigation";
import type { BookPageData, ResolvedMedia } from "@/lib/content/book";
import type { BookCovers } from "@/lib/content/covers";
import type { PreviewOptions } from "@/lib/content/preview";
import { BookPreview } from "@/components/admin/book-preview";
import { Segmented } from "@/components/admin/editor-fields";
import { inputClass, labelClass } from "@/components/admin/styles";

// Changing a choice reloads the page with it in the address, so a preview can be bookmarked or shared.
export function PreviewControls({
  chapters,
  categories,
  chapterId,
  categoryId,
  includeDrafts,
}: PreviewOptions & { chapterId: string | null; categoryId: string | null; includeDrafts: boolean }) {
  const router = useRouter();
  const go = (patch: { chapter?: string | null; category?: string | null; content?: string | null }) => {
    const next = { chapter: chapterId, category: categoryId, content: includeDrafts ? null : "published", ...patch };
    const query = new URLSearchParams(Object.entries(next).filter((entry): entry is [string, string] => Boolean(entry[1])));
    router.push(`/admin/handbook/preview${query.size ? `?${query}` : ""}`);
  };
  const sections = [...new Set(chapters.map((chapter) => chapter.sectionLabel))];

  return (
    <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="min-w-0 space-y-1">
        <label htmlFor="preview-show" className={labelClass}>
          Show
        </label>
        <select id="preview-show" value={chapterId ?? ""} onChange={(event) => go({ chapter: event.target.value || null })} className={`${inputClass} max-w-72`}>
          <option value="">Whole book</option>
          {sections.map((section) => (
            <optgroup key={section} label={section}>
              {chapters
                .filter((chapter) => chapter.sectionLabel === section)
                .map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="min-w-0 space-y-1">
        <label htmlFor="preview-category" className={labelClass}>
          As category
        </label>
        <select
          id="preview-category"
          value={categoryId ?? ""}
          onChange={(event) => go({ category: event.target.value || null })}
          className={`${inputClass} max-w-72`}
        >
          <option value="">All chapters</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      </div>
      <Segmented
        label="Content"
        value={includeDrafts ? "all" : "published"}
        options={[
          ["all", "Include drafts"],
          ["published", "Published only"],
        ]}
        onChange={(value) => go({ content: value === "published" ? "published" : null })}
      />
    </div>
  );
}

export function PreviewReader({ pages, media, covers }: { pages: BookPageData[]; media: ResolvedMedia; covers?: BookCovers }) {
  return (
    <BookPreview pages={pages} media={media} label="Book preview" initialDevice="full" readerTools allowFullWindow covers={covers} />
  );
}
