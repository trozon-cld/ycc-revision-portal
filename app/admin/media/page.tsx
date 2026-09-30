import Image from "next/image";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { getSignedUrls, isStorageConfigured } from "@/lib/storage/storage";
import { FilterBar, FilterSearch } from "@/components/admin/filter-bar";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination, pageFromParam } from "@/components/admin/pagination";
import { cardClass } from "@/components/admin/styles";
import { MediaRowActions } from "./media-row-actions";
import { UploadMediaButton } from "./upload-media-form";

interface MediaRow {
  id: string;
  thumb_path: string;
  original_name: string;
  mime_type: string;
  width: number;
  height: number;
  byte_size: number;
  alt_text: string;
  used_in: number;
  used_in_questions: number;
  used_in_covers: number;
}

const PAGE_SIZE = 60;
const THUMB_EDGE = 400;
const LINK_LIFETIME_SECONDS = 60 * 60;

export default async function MediaPage({ searchParams }: PageProps<"/admin/media">) {
  await requireRole(["superadmin"]);
  const params = await searchParams;
  const search = (one(params.q) ?? "").trim().slice(0, 100);
  const configured = isStorageConfigured();

  const matches = `$1 = '' or alt_text ilike '%' || $1 || '%' escape '\\' or original_name ilike '%' || $1 || '%' escape '\\'`;
  const { rows: counted } = await pool.query<{ total: number }>(
    `select count(*)::int as total from media where ${matches}`,
    [escapeLike(search)]
  );
  const total = counted[0].total;
  const page = pageFromParam(one(params.page), total, PAGE_SIZE);

  const { rows: media } = await pool.query<MediaRow>(
    `select id, thumb_path, original_name, mime_type, width, height, byte_size, alt_text,
            (select count(*) from content_page_media u where u.media_id = media.id)::int as used_in,
            (select count(*) from question_media u where u.media_id = media.id)::int as used_in_questions,
            (select count(*) from categories u where u.front_cover_media_id = media.id or u.back_cover_media_id = media.id)::int
              as used_in_covers
     from media
     where ${matches}
     order by created_at desc, id
     limit $2 offset $3`,
    [escapeLike(search), PAGE_SIZE, (page - 1) * PAGE_SIZE]
  );

  let thumbs = new Map<string, string>();
  let linksFailed = false;
  if (configured && media.length > 0) {
    try {
      thumbs = await getSignedUrls(
        media.map((item) => item.thumb_path),
        LINK_LIFETIME_SECONDS
      );
    } catch (error) {
      console.error("Could not create picture links", error);
      linksFailed = true;
    }
  }

  return (
    <>
      <PageHeader
        title="Media"
        description={`${total.toLocaleString("en-GB")} picture${total === 1 ? "" : "s"}${search ? " found" : ""}`}
        actions={<UploadMediaButton configured={configured} />}
      />

      {!configured && (
        <p role="status" className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-600/25">
          Image storage isn&apos;t set up yet. Add <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> to
          the server&apos;s environment and restart it.
        </p>
      )}
      {linksFailed && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          The pictures couldn&apos;t be loaded from storage. Check the storage settings and try again.
        </p>
      )}

      <FilterBar action="/admin/media" clearHref="/admin/media" isFiltered={Boolean(search)}>
        <FilterSearch name="q" label="Search descriptions or file names" defaultValue={search} />
      </FilterBar>

      {media.length === 0 ? (
        <p className={`${cardClass} px-4 py-8 text-center text-sm text-slate-600`}>
          {search ? "No pictures match your search." : "No pictures yet. Upload the first one."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {media.map((item) => {
            const thumbUrl = thumbs.get(item.thumb_path);
            const thumbSize = fitWithin(item.width, item.height, THUMB_EDGE);
            return (
              <li key={item.id} className={`${cardClass} flex min-w-0 flex-col`}>
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-t-lg bg-slate-100">
                  {thumbUrl ? (
                    // Signed links change each visit, so Next's optimiser can't cache them; files are pre-shrunk instead.
                    <Image
                      src={thumbUrl}
                      alt={item.alt_text}
                      width={thumbSize.width}
                      height={thumbSize.height}
                      unoptimized
                      loading="lazy"
                      className="size-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-slate-600">No preview</span>
                  )}
                </div>
                <div className="flex flex-1 items-start gap-1 p-3 pr-1">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-ink [overflow-wrap:anywhere]">{item.alt_text}</p>
                    <p className="mt-1 text-xs text-slate-600" title={item.original_name}>
                      {item.width} × {item.height} · {formatBytes(item.byte_size)} · {formatType(item.mime_type)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {item.used_in === 0 && item.used_in_questions === 0 && item.used_in_covers === 0
                        ? "Not used yet"
                        : usedLabel(item.used_in, item.used_in_questions, item.used_in_covers)}
                    </p>
                  </div>
                  <MediaRowActions
                    id={item.id}
                    altText={item.alt_text}
                    name={item.original_name}
                    thumbUrl={thumbUrl}
                    usedIn={item.used_in}
                    usedInQuestions={item.used_in_questions}
                    usedInCovers={item.used_in_covers}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        basePath="/admin/media"
        page={page}
        hasMore={page * PAGE_SIZE < total}
        query={{ q: search }}
        total={total}
        pageSize={PAGE_SIZE}
      />
    </>
  );
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function fitWithin(width: number, height: number, edge: number) {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatType(mime: string) {
  return mime === "image/webp" ? "WebP" : mime === "image/png" ? "PNG" : "JPEG";
}

// Keeps the Day 3 wording ("Used in 2 pages") and adds questions and covers when there are any.
function usedLabel(pages: number, questions: number, covers: number): string {
  const parts: string[] = [];
  if (pages > 0) parts.push(`${pages} page${pages === 1 ? "" : "s"}`);
  if (questions > 0) parts.push(`${questions} question${questions === 1 ? "" : "s"}`);
  if (covers > 0) parts.push(`${covers} cover${covers === 1 ? "" : "s"}`);
  return `Used in ${parts.join(" · ")}`;
}
