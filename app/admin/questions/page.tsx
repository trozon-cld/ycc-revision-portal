import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { plainText } from "@/lib/content/inline";
import { questionRef } from "@/lib/questions/labels";
import { BANK_PAGE_SIZE, countBankQuestions, countQuestions, listBankQuestions, listChapterOptions, type BankFilters, type BankRow } from "@/lib/questions/queries";
import { availableQuestionTypes, QUESTION_TYPES } from "@/lib/questions/registry";
import { isQuestionType, QUESTION_TYPE_KEYS } from "@/lib/questions/types";
import { loadCategoryGroups } from "@/lib/handbook/categories";
import { isUuid } from "@/lib/ids";
import { firstParam } from "@/lib/params";
import { Badge } from "@/components/admin/badge";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/admin/filter-bar";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination, listSearch, pageFromParam } from "@/components/admin/pagination";
import { RememberListPlace } from "@/components/admin/list-place";
import { Cell, Row, Table } from "@/components/admin/table";
import { NewQuestionButton, QuestionRowActions } from "./question-row-actions";

export const metadata: Metadata = { title: "Question bank" };

export default async function QuestionBankPage({ searchParams }: PageProps<"/admin/questions">) {
  await requireRole(CONTENT_EDITORS);
  const params = await searchParams;

  const statusParam = firstParam(params.status) ?? "";
  const typeParam = firstParam(params.type) ?? "";
  const filters: BankFilters = {
    search: (firstParam(params.q) ?? "").trim().slice(0, 100),
    sectionId: uuidOrNull(firstParam(params.section)),
    chapterId: uuidOrNull(firstParam(params.chapter)),
    categoryId: uuidOrNull(firstParam(params.category)),
    type: isQuestionType(typeParam) ? typeParam : null,
    status: statusParam === "draft" || statusParam === "published" ? statusParam : null,
  };
  const isFiltered = Boolean(
    filters.search || filters.sectionId || filters.chapterId || filters.categoryId || filters.type || filters.status
  );

  const [matching, total, sections, categoryGroups] = await Promise.all([
    countBankQuestions(filters),
    countQuestions(),
    listChapterOptions(),
    loadCategoryGroups(),
  ]);
  const totalLabel = `${total.toLocaleString("en-GB")} question${total === 1 ? "" : "s"}`;
  const page = pageFromParam(firstParam(params.page), matching, BANK_PAGE_SIZE);
  const rows = await listBankQuestions(filters, page);

  const query = {
    q: filters.search,
    section: filters.sectionId ?? "",
    chapter: filters.chapterId ?? "",
    category: filters.categoryId ?? "",
    type: filters.type ?? "",
    status: filters.status ?? "",
  };

  return (
    <>
      <RememberListPlace list="questions" search={listSearch(query, page)} />
      <PageHeader
        title="Question bank"
        description={
          isFiltered
            ? `${matching.toLocaleString("en-GB")} of ${totalLabel} match your filters`
            : totalLabel
        }
        actions={
          <NewQuestionButton
            types={availableQuestionTypes().map((key) => ({ key, label: QUESTION_TYPES[key].label }))}
            chapters={sections}
            defaultChapterId={filters.chapterId}
          />
        }
      />

      <FilterBar action="/admin/questions" clearHref="/admin/questions" isFiltered={isFiltered}>
        <FilterSearch name="q" label="Search question text or ID" defaultValue={filters.search} />
        <FilterSelect name="section" label="Section" defaultValue={filters.sectionId ?? ""}>
          <option value="">All sections</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
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
        <FilterSelect name="category" label="Category" defaultValue={filters.categoryId ?? ""}>
          <option value="">All categories</option>
          {categoryGroups
            .filter((group) => group.categories.length > 0)
            .map((group) => (
              <optgroup key={group.id} label={group.label}>
                {group.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </optgroup>
            ))}
        </FilterSelect>
        <FilterSelect name="type" label="Type" defaultValue={filters.type ?? ""}>
          <option value="">All types</option>
          {QUESTION_TYPE_KEYS.map((type) => (
            <option key={type} value={type}>
              {QUESTION_TYPES[type].label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect name="status" label="Status" defaultValue={filters.status ?? ""}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </FilterSelect>
      </FilterBar>

      <Table
        columns={["Question", "Chapter", "Type", "Status", "Used in", ""]}
        isEmpty={rows.length === 0}
        emptyMessage={
          total === 0 ? "No questions yet. Add the first one with New question." : "No questions match these filters."
        }
      >
        {rows.map((row) => {
          const refLabel = questionRef(row.refNo);
          return (
            <Row key={row.id}>
              <Cell kind="primary" wide>
                <div className="flex gap-2">
                  <span className="shrink-0 font-mono text-slate-600 tabular-nums">{refLabel}</span>
                  <div className="min-w-0 font-normal">
                    <Link
                      href={`/admin/questions/${row.id}`}
                      className="line-clamp-2 text-ink underline-offset-2 hover:text-primary hover:underline"
                    >
                      {plainText(row.stemText)}
                    </Link>
                    {row.hasPicture && (
                      <span className="mt-1 block text-xs text-slate-600">
                        <PictureIcon /> Has a picture
                      </span>
                    )}
                  </div>
                </div>
              </Cell>
              <Cell label="Chapter">{row.chapterLabel}</Cell>
              <Cell label="Type">
                {QUESTION_TYPES[row.type].label}
              </Cell>
              <Cell label="Status" nowrap>
                <Badge tone={row.status === "published" ? "success" : "neutral"}>
                  {row.status === "published" ? "Published" : "Draft"}
                </Badge>
              </Cell>
              <Cell label="Used in">
                {usedIn(row).length > 0 ? (
                  usedIn(row).map((use, index) => (
                    <span key={use} className="xl:whitespace-nowrap">
                      {use}
                      {index < usedIn(row).length - 1 && ", "}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-600">Not used</span>
                )}
              </Cell>
              <Cell kind="actions">
                <QuestionRowActions id={row.id} refLabel={refLabel} status={row.status} bookChapter={row.bookChapter} />
              </Cell>
            </Row>
          );
        })}
      </Table>

      <Pagination
        basePath="/admin/questions"
        page={page}
        hasMore={page * BANK_PAGE_SIZE < matching}
        query={query}
        total={matching}
        pageSize={BANK_PAGE_SIZE}
      />
    </>
  );
}

function PictureIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="mr-0.5 inline size-3.5 align-[-2px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <circle cx="7.5" cy="8.5" r="1.25" />
      <path d="M3.5 14.5l4-4 3 3 2-2 4 4" />
    </svg>
  );
}


function uuidOrNull(value: string | undefined): string | null {
  return value && isUuid(value) ? value : null;
}

// Where the question is set to appear: placed in its chapter's Handbook pages, and its Practice / Mock test switches.
function usedIn(row: BankRow): string[] {
  return [row.bookChapter && "Handbook", row.inPractice && "Practice", row.inMock && "Mock test"].filter((use): use is string => Boolean(use));
}
