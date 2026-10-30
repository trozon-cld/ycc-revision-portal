import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { formatCount } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { firstParam } from "@/lib/params";
import { listChapterOptions } from "@/lib/questions/queries";
import { planBulkRun } from "@/lib/voice/bulk";
import { loadVoiceLanguages } from "@/lib/voice/language-store";
import { LANGUAGE_TABS, LANGUAGES_BULK_PATH } from "@/lib/voice/language-tabs";
import { SOURCE_LANGUAGE } from "@/lib/voice/languages";
import { GOOGLE_FREE_CHARACTERS_PER_MONTH, GOOGLE_PRICE_PER_MILLION, VOICE_CHARACTERS_PER_HOUR } from "@/lib/voice/limits";
import { chapterLanguageCounts } from "@/lib/voice/overview";
import { geminiToday, voiceUsageSummary } from "@/lib/voice/quota";
import { formatUkTime } from "@/lib/candidates/access";
import { Badge } from "@/components/admin/badge";
import { FilterBar, FilterSelect } from "@/components/admin/filter-bar";
import { PageHeader } from "@/components/admin/page-header";
import { PageTabs } from "@/components/admin/page-tabs";
import { buttonClass } from "@/components/admin/styles";
import { Cell, Row, Table } from "@/components/admin/table";
import { VoiceUsage } from "../voice-usage";
import { BulkRunner, type BulkLimits } from "./bulk-runner";

export const metadata: Metadata = { title: "Bulk Listen" };

const BASE_PATH = LANGUAGES_BULK_PATH;

// The Bulk tab: one language at a time, its progress per chapter, and a run for one chapter.
export default async function BulkListenPage({ searchParams }: PageProps<"/admin/handbook/languages/bulk">) {
  const session = await requireRole(CONTENT_EDITORS);
  const params = await searchParams;
  const languages = await loadVoiceLanguages();
  // Another language first when there is one (English needs audio only).
  const shown =
    languages.find((language) => language.code === firstParam(params.language)) ??
    languages.find((language) => language.code !== SOURCE_LANGUAGE) ??
    languages[0];
  const chapterParam = firstParam(params.chapter);

  const [sections, counts, usage] = await Promise.all([listChapterOptions(), chapterLanguageCounts(shown.code), voiceUsageSummary(session.sub)]);
  const chapters = sections.flatMap((section) => section.chapters);
  const chosen = chapterParam && isUuid(chapterParam) ? chapters.find((chapter) => chapter.id === chapterParam) : undefined;
  const plan = chosen ? await planBulkRun(chosen.id, shown.code) : null;
  const gemini = plan?.language.gemini ? await geminiToday(shown.code) : null;

  const monthGoogle = (kind: "translate" | "speech") =>
    usage.month.filter((row) => row.kind === kind && row.service === "google").reduce((sum, row) => sum + row.characters, 0);
  const limits: BulkLimits = {
    hourLeft: {
      translate: Math.max(0, VOICE_CHARACTERS_PER_HOUR.translate - usage.hour.translate),
      speech: Math.max(0, VOICE_CHARACTERS_PER_HOUR.speech - usage.hour.speech),
    },
    hourLimit: VOICE_CHARACTERS_PER_HOUR,
    monthFreeLeft: {
      translate: Math.max(0, GOOGLE_FREE_CHARACTERS_PER_MONTH.translate - monthGoogle("translate")),
      speech: Math.max(0, GOOGLE_FREE_CHARACTERS_PER_MONTH.speech - monthGoogle("speech")),
    },
    pricePerMillion: GOOGLE_PRICE_PER_MILLION,
    gemini: gemini
      ? { perDay: gemini.perDay, perMinute: gemini.perMinute, usedToday: gemini.usedToday, resets: formatUkTime(gemini.resetsAt) }
      : null,
  };
  const byChapter = new Map(counts.map((row) => [row.chapterId, row]));
  const totals = counts.reduce((sum, row) => ({ total: sum.total + row.total, ready: sum.ready + row.ready, todo: sum.todo + row.todo }), {
    total: 0,
    ready: 0,
    todo: 0,
  });
  const chapterHref = (id: string) => `${BASE_PATH}?${new URLSearchParams({ language: shown.code, chapter: id }).toString()}#run`;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/admin/handbook" className="text-primary underline underline-offset-2 hover:text-ink">
          Handbook
        </Link>
      </nav>
      <PageHeader title="Languages and audio" description={`Bulk Listen · ${shown.name}: ${formatCount(totals.ready)} of ${formatCount(totals.total, "item")} done`} />
      <PageTabs label="Languages and audio" tabs={LANGUAGE_TABS} current={LANGUAGES_BULK_PATH} />
      <VoiceUsage usage={usage} />

      <p className="mb-4 max-w-3xl text-sm text-slate-600">
        One chapter in one language at a time. A run translates the pages and questions that need it, marks those translations as
        checked automatically (so a person can look at them later), then makes the audio. Drafts a person is checking are left alone.
        Everything finished is saved straight away, so a run can be stopped and started again.
      </p>

      <FilterBar action={BASE_PATH} clearHref={BASE_PATH} isFiltered={false}>
        <FilterSelect name="language" label="Language" defaultValue={shown.code}>
          {languages.map((language) => (
            <option key={language.code} value={language.code}>
              {language.name}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>

      {chapterParam && !plan && (
        <p role="alert" className="mb-4 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-strong ring-1 ring-warn/25">
          That chapter no longer exists. Choose one below.
        </p>
      )}

      {plan && (
        <section id="run" aria-labelledby="run-heading" className="mb-6 scroll-mt-4">
          {/* Keyed by chapter and language, so choosing another starts a fresh runner. */}
          <BulkRunner key={`${plan.chapter.id}:${plan.language.code}`} plan={plan} limits={limits} closeHref={`${BASE_PATH}?language=${shown.code}`} />
        </section>
      )}

      <Table
        columns={["Chapter", "Items", "Done", "To do", "Waiting for check", ""]}
        widths={["", "md:w-20", "md:w-24", "md:w-24", "md:w-36", "md:w-28"]}
        isEmpty={chapters.length === 0}
        emptyMessage="No chapters yet."
      >
        {chapters.map((chapter) => {
          const row = byChapter.get(chapter.id) ?? { total: 0, ready: 0, todo: 0, waiting: 0 };
          const isChosen = chapter.id === chosen?.id;
          return (
            <Row key={chapter.id}>
              <Cell kind="primary">
                {chapter.label} {isChosen && <Badge tone="info">Chosen</Badge>}
              </Cell>
              <Cell label="Items">{row.total}</Cell>
              <Cell label="Done">
                {row.total > 0 && row.ready === row.total ? <Badge tone="success">{`✓ ${row.ready}`}</Badge> : row.ready}
              </Cell>
              <Cell label="To do">{row.todo > 0 ? <Badge tone="warning">{String(row.todo)}</Badge> : 0}</Cell>
              <Cell label="Waiting for check">{row.waiting}</Cell>
              <Cell label="Run">
                {row.todo > 0 && (
                  <Link
                    href={chapterHref(chapter.id)}
                    aria-label={`Choose ${chapter.label} in ${shown.name}`}
                    className={buttonClass(isChosen ? "primary" : "secondary", "sm")}
                  >
                    Choose
                  </Link>
                )}
              </Cell>
            </Row>
          );
        })}
      </Table>
    </>
  );
}
