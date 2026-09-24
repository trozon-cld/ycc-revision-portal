import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import type { ResolvedMedia } from "@/lib/content/book";
import { getSignedUrls, isStorageConfigured } from "@/lib/storage/storage";
import { PageHeader } from "@/components/admin/page-header";
import { buttonClass } from "@/components/admin/styles";
import { SAMPLE_PAGES, SAMPLE_PICTURE_TALL, SAMPLE_PICTURE_WIDE, placeholderPicture } from "./sample-content";
import { SamplePreview } from "./sample-preview";

// Lets the Superadmin judge the candidate page look before real pages exist. Placeholder text only.
export default async function SamplePagePage() {
  await requireRole(["superadmin"]);

  const media: ResolvedMedia = {
    [SAMPLE_PICTURE_WIDE]: { src: placeholderPicture(1600, 1000, "Sample picture"), width: 1600, height: 1000, alt: "Sample picture placeholder" },
    [SAMPLE_PICTURE_TALL]: { src: placeholderPicture(900, 1400, "Tall picture"), width: 900, height: 1400, alt: "Tall sample picture placeholder" },
  };

  // Use real pictures from the Media library when there are some, to show real loading.
  if (isStorageConfigured()) {
    try {
      const { rows } = await pool.query<{ storage_path: string; width: number; height: number; alt_text: string }>(
        `select storage_path, width, height, alt_text from media order by (width >= height) desc, created_at desc limit 2`
      );
      const urls = await getSignedUrls(rows.map((row) => row.storage_path), 60 * 60);
      rows.forEach((row, index) => {
        const src = urls.get(row.storage_path);
        const key = index === 0 ? SAMPLE_PICTURE_WIDE : SAMPLE_PICTURE_TALL;
        if (src) media[key] = { src, width: row.width, height: row.height, alt: row.alt_text };
      });
    } catch (error) {
      console.error("Sample page: could not load Media pictures, using placeholders", error);
    }
  }

  return (
    <>
      <PageHeader
        title="Sample page"
        description="How Handbook pages will look to candidates. The text is placeholder only."
        actions={
          <Link href="/admin/handbook" className={buttonClass("secondary")}>
            Back to Handbook
          </Link>
        }
      />
      <SamplePreview pages={SAMPLE_PAGES} media={media} />
    </>
  );
}
