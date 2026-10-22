import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { formatClock } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { firstParam } from "@/lib/params";
import { listChapterOptions } from "@/lib/questions/queries";
import { loadVoiceLanguages } from "@/lib/voice/language-store";
import { SOURCE_LANGUAGE } from "@/lib/voice/languages";
import { LANGUAGE_TABS, LANGUAGES_PAGES_PATH } from "@/lib/voice/language-tabs";
import { PageTabs } from "@/components/admin/page-tabs";
import {
  LANGUAGE_KIND_LABELS,
  LANGUAGE_KINDS,
  LANGUAGE_LIST_PAGE_SIZE,
  LANGUAGE_NEED_LABELS,
  LANGUAGE_NEEDS,
  countAllLanguageItems,
  countLanguageItems,
  isLanguageKind,
  isLanguageNeed,
  languageTotals,
  listLanguageItems,
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

const BASE_PATH = LANGUAGES_PAGES_PATH;

export default async function LanguagesPage({ searchParams }: PageProps<"/admin/handbook/languages">) {
  await requireRole(CONTENT_EDITORS);
  const params = await searchParams;
  const languages = await loadVoiceLanguages();

  const chapterParam = firstParam(params.chapter);
  const needParam = firstParam(params.need);
  const kindParam = firstParam(params.kind);
  const filters: LanguageFilters = {
    search: (firstParam(params.q) ?? "").trim().slice(0, 100),
    chapterId: chapterParam && isUuid(chapterParam) ? chapterParam : null,
    language: languages.find((language) => language.code === firstParam(params.language))?.code ?? null,
    need: isLanguageNeed(needParam) ? needParam : null,
    kind: isLanguageKind(kindParam) ? kindParam : null,
  };
  const isFiltered = Boolean(filters.search || filters.chapterId || filters.language || filters.need || filters.kind);

  const [matching, counts, totals, sections] = await Promise.all([
    countLanguageItems(filters),
    countAllLanguageItems(),
    languageTotals(),
    listChapterOptions(),
  ]);
  const page = pageFromParam(firstParam(params.page), matching, LANGUAGE_LIST_PAGE_SIZE);
  const rows = await listLanguageItems(filters, page);
  const query = { q: filters.search, chapter: filters.chapterId ?? "", language: filters.language ?? "", need: filters.need ?? "", kind: filters.kind ?? "" };
  const total = counts.pages + counts.questions;
  const pagesLabel = `${plural(counts.pages, "text page")} and ${plural(counts.questions, "question page")}`;
  const later = counts.pages + counts.questions - counts.listenable;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/admin/handbook" className="text-primary underline underline-offset-2 hover:text-ink">
          Handbook
        </Link>
      </nav>
      <PageHeader
        title="Languages and audio"
        description={isFiltered ? `${matching.toLocaleString("en-GB")} of ${plural(total, "page")} match your filters` : pagesLabel}
      />
      <PageTabs label="Languages and audio" tabs={LANGUAGE_TABS} current={LANGUAGES_PAGES_PATH} />

      <ul aria-label="Totals" className="mb-2 grid gap-2 sm:grid-cols-3">
        {languages.map((language) => {
          const done = totals.find((row) => row.language === language.code);
          return (
            <li key={language.code} className={`${cardClass} px-3 py-2 text-sm`}>
              <p className="font-medium text-ink">{language.name}</p>
              <p className="text-slate-700">
                {language.code === SOURCE_LANGUAGE ? "The page itself" : `Checked: ${done?.checked ?? 0} of ${counts.listenable}`}
                {" · "}Audio ready: {done?.audioReady ?? 0} of {counts.listenable}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="mb-4 text-xs text-slate-600">
        {later > 0
          ? `Totals count every page that can have Listen. ${plural(later, "question page")} ${later === 1 ? "is a type" : "are types"} that Listen comes to later.`
          : "Totals count every page that can have Listen."}
      </p>

      <FilterBar action={BASE_PATH} clearHref={BASE_PATH} isFiltered={isFiltered}>
        <FilterSearch name="q" label="Search titles, questions or Q numbers" defaultValue={filters.search} />
        <FilterSelect name="kind" label="Pages" defaultValue={filters.kind ?? ""}>
          <option value="">Text and question pages</option>
          {LANGUAGE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {LANGUAGE_KIND_LABELS[kind]}
            </option>
          ))}
        </FilterSelect>
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
          {languages.map((language) => (
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
        columns={["Page", "Status", ...languages.map((language) => language.name)]}
        isEmpty={rows.length === 0}
        emptyMessage={total === 0 ? "No pages yet. Add pages to chapters in the Handbook." : "No pages match these filters."}
      >
        {rows.map((row) => (
          <Row key={row.id}>
            <Cell kind="primary" wide>
              <Link href={editorHref(row.kind, row.id)} className="text-ink underline-offset-2 hover:text-primary hover:underline">
                {row.title}
              </Link>
              <span className="mt-0.5 block text-xs font-normal text-slate-600">
                {row.kind === "question" && "Question page · "}
                {row.chapterLabel}
              </span>
            </Cell>
            <Cell label="Status" nowrap>
              <Badge tone={row.status === "published" ? "success" : "neutral"}>{row.status === "published" ? "Published" : "Draft"}</Badge>
            </Cell>
            {!row.states && (
              <Cell label="Languages" colSpan={languages.length}>
                <span className="text-xs text-slate-600">Listen for this question type comes later</span>
              </Cell>
            )}
            {row.states && languages.map((language) => {
              const state = row.states![language.code];
              return (
                <Cell key={language.code} label={language.name}>
                  <span className="inline-flex flex-wrap justify-end gap-1 md:flex-col md:items-start">
                    {state.translation && (
                      <Link
                        href={`${editorHref(row.kind, row.id)}/translations?lang=${language.code}`}
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

function editorHref(kind: "page" | "question", id: string): string {
  return kind === "page" ? `/admin/handbook/pages/${id}` : `/admin/questions/${id}`;
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString("en-GB")} ${noun}${count === 1 ? "" : "s"}`;
}
