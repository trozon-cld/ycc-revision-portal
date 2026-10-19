import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { formatClock } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { firstParam } from "@/lib/params";
import { listChapterOptions } from "@/lib/questions/queries";
import { SOURCE_LANGUAGE, VOICE_LANGUAGES, voiceLanguage } from "@/lib/voice/languages";
import {
  LANGUAGE_LIST_PAGE_SIZE,
  LANGUAGE_NEED_LABELS,
  LANGUAGE_NEEDS,
  countAllTextPages,
  countLanguagePages,
  isLanguageNeed,
  languageTotals,
  listLanguagePages,
  type LanguageFilters,
} from "@/lib/voice/overview";
import { Badge } from "@/components/admin/badge";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/admin/filter-bar";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination, pageFromParam } from "@/components/admin/pagination";
import { cardClass } from "@/components/admin/styles";
import { Cell, Row, Table } from "@/components/admin/table";
import { AudioBadge, TranslationBadge } from "../pages/translation-badge";

export const metadata: Metadata = { title: "Languages and audio" };

const BASE_PATH = "/admin/handbook/languages";

export default async function LanguagesPage({ searchParams }: PageProps<"/admin/handbook/languages">) {
  await requireRole(CONTENT_EDITORS);
  const params = await searchParams;

  const chapterParam = firstParam(params.chapter);
  const needParam = firstParam(params.need);
  const filters: LanguageFilters = {
    search: (firstParam(params.q) ?? "").trim().slice(0, 100),
    chapterId: chapterParam && isUuid(chapterParam) ? chapterParam : null,
    language: voiceLanguage(firstParam(params.language))?.code ?? null,
    need: isLanguageNeed(needParam) ? needParam : null,
  };
  const isFiltered = Boolean(filters.search || filters.chapterId || filters.language || filters.need);

  const [matching, total, totals, sections] = await Promise.all([
    countLanguagePages(filters),
    countAllTextPages(),
    languageTotals(),
    listChapterOptions(),
  ]);
  const page = pageFromParam(firstParam(params.page), matching, LANGUAGE_LIST_PAGE_SIZE);
  const rows = await listLanguagePages(filters, page);
  const query = { q: filters.search, chapter: filters.chapterId ?? "", language: filters.language ?? "", need: filters.need ?? "" };
  const pagesLabel = `${total.toLocaleString("en-GB")} text page${total === 1 ? "" : "s"}`;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/admin/handbook" className="text-primary underline underline-offset-2 hover:text-ink">
          Handbook
        </Link>
      </nav>
      <PageHeader
        title="Languages and audio"
        description={isFiltered ? `${matching.toLocaleString("en-GB")} of ${pagesLabel} match your filters` : pagesLabel}
      />

      <ul aria-label="Totals" className="mb-4 grid gap-2 sm:grid-cols-3">
        {VOICE_LANGUAGES.map((language) => {
          const counts = totals.find((row) => row.language === language.code);
          return (
            <li key={language.code} className={`${cardClass} px-3 py-2 text-sm`}>
              <p className="font-medium text-ink">{language.name}</p>
              <p className="text-slate-700">
                {language.code === SOURCE_LANGUAGE ? "The page itself" : `Checked: ${counts?.checked ?? 0} of ${total}`}
                {" · "}Audio ready: {counts?.audioReady ?? 0} of {total}
              </p>
            </li>
          );
        })}
      </ul>

      <FilterBar action={BASE_PATH} clearHref={BASE_PATH} isFiltered={isFiltered}>
        <FilterSearch name="q" label="Search page titles" defaultValue={filters.search} />
        <FilterSelect name="chapter" label="Chapter" defaultValue={filters.chapterId ?? ""}>
          <option value="">All chapters</option>
          {sections
            .filter((section) => section.chapters.length > 0)
            .map((section) => (
              <optgroup key={section.id} label={section.label}>
                {section.chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.label}
                  </option>
                ))}
              </optgroup>
            ))}
        </FilterSelect>
        <FilterSelect name="language" label="Language" defaultValue={filters.language ?? ""}>
          <option value="">All languages</option>
          {VOICE_LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {language.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect name="need" label="Show" defaultValue={filters.need ?? ""}>
          <option value="">Any state</option>
          {LANGUAGE_NEEDS.map((need) => (
            <option key={need} value={need}>
              {LANGUAGE_NEED_LABELS[need]}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>

      <Table
        columns={["Page", "Status", ...VOICE_LANGUAGES.map((language) => language.name)]}
        isEmpty={rows.length === 0}
        emptyMessage={total === 0 ? "No text pages yet. Add pages to chapters in the Handbook." : "No pages match these filters."}
      >
        {rows.map((row) => (
          <Row key={row.id}>
            <Cell kind="primary" wide>
              <Link href={`/admin/handbook/pages/${row.id}`} className="text-ink underline-offset-2 hover:text-primary hover:underline">
                {row.title}
              </Link>
              <span className="mt-0.5 block text-xs font-normal text-slate-600">{row.chapterLabel}</span>
            </Cell>
            <Cell label="Status" nowrap>
              <Badge tone={row.status === "published" ? "success" : "neutral"}>{row.status === "published" ? "Published" : "Draft"}</Badge>
            </Cell>
            {VOICE_LANGUAGES.map((language) => {
              const state = row.states[language.code];
              return (
                <Cell key={language.code} label={language.name}>
                  <span className="inline-flex flex-wrap justify-end gap-1 md:flex-col md:items-start">
                    {state.translation && (
                      <Link
                        href={`/admin/handbook/pages/${row.id}/translations?lang=${language.code}`}
                        className="inline-flex min-h-6 items-center rounded-full"
                      >
                        <span className="sr-only">{language.name} translation: </span>
                        <TranslationBadge state={state.translation} />
                      </Link>
                    )}
                    <span className="inline-flex min-h-6 flex-wrap items-center gap-x-1">
                      <AudioBadge state={state.audio} />
                      {state.durationMs !== null && state.audio !== "waiting" && (
                        <span className="text-xs tabular-nums text-slate-600">{formatClock(state.durationMs)}</span>
                      )}
                    </span>
                  </span>
                </Cell>
              );
            })}
          </Row>
        ))}
      </Table>

      <Pagination
        basePath={BASE_PATH}
        page={page}
        hasMore={page * LANGUAGE_LIST_PAGE_SIZE < matching}
        query={query}
        total={matching}
        pageSize={LANGUAGE_LIST_PAGE_SIZE}
      />
    </>
  );
}
