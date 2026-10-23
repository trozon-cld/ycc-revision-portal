import type { Metadata } from "next";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/admin/badge";
import { PageHeader } from "@/components/admin/page-header";
import { PageTabs } from "@/components/admin/page-tabs";
import { Cell, Row, Table } from "@/components/admin/table";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { requireRole } from "@/lib/auth/guard";
import { countOf } from "@/lib/format";
import { LANGUAGE_CATALOGUE } from "@/lib/voice/language-catalogue";
import { listManagedLanguages, type ManagedLanguage } from "@/lib/voice/language-admin";
import { LANGUAGE_TABS, LANGUAGES_MANAGE_PATH } from "@/lib/voice/language-tabs";
import { phraseKeysFor, type LanguageStatus } from "@/lib/voice/languages";
import { AddLanguageButton, LanguageRowActions } from "./language-row-actions";

export const metadata: Metadata = { title: "Languages" };

const STATUS: Record<LanguageStatus, { label: string; tone: BadgeTone }> = {
  live: { label: "Live", tone: "success" },
  draft: { label: "Draft", tone: "info" },
  hidden: { label: "Hidden", tone: "neutral" },
};

// The Languages tab: the languages Listen offers, their spoken phrases, and adding, going live, hiding.
export default async function ManageLanguagesPage() {
  await requireRole(CONTENT_EDITORS);
  const languages = await listManagedLanguages();
  const added = new Set(languages.map((language) => language.code));
  const addable = LANGUAGE_CATALOGUE.filter((language) => !added.has(language.code)).map((language) => ({
    code: language.code,
    label: `${language.name} (${language.nativeName})`,
  }));
  const live = languages.filter((language) => language.status === "live").length;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/admin/handbook" className="text-primary underline underline-offset-2 hover:text-ink">
          Handbook
        </Link>
      </nav>
      <PageHeader
        title="Languages and audio"
        description={`${countOf(languages.length, "language")} · ${live} live`}
        actions={<AddLanguageButton options={addable} />}
      />
      <PageTabs label="Languages and audio" tabs={LANGUAGE_TABS} current={LANGUAGES_MANAGE_PATH} />

      <p className="mb-4 max-w-3xl text-sm text-slate-600">
        Candidates choose from the live languages on their Account page. A new language starts as a draft: draft its spoken phrases, check them,
        then make it live. Its pages can be translated and given audio while it&apos;s a draft.
      </p>

      <Table
        columns={["Language", "Status", "Spoken phrases", "Candidates", ""]}
        widths={["", "md:w-28", "md:w-56", "md:w-28", "md:w-14"]}
        isEmpty={languages.length === 0}
        emptyMessage="No languages yet."
      >
        {languages.map((language) => (
          <Row key={language.code}>
            <Cell kind="primary">
              <Link href={`${LANGUAGES_MANAGE_PATH}/${language.code}`} className="text-primary underline underline-offset-2 hover:text-ink">
                {language.name}
              </Link>{" "}
              <span lang={language.code} className="text-slate-600">
                {language.nativeName}
              </span>
            </Cell>
            <Cell label="Status" nowrap>
              <Badge tone={STATUS[language.status].tone}>{STATUS[language.status].label}</Badge>
            </Cell>
            <Cell label="Spoken phrases">
              <PhraseState language={language} />
            </Cell>
            <Cell label="Candidates">{language.candidates}</Cell>
            <Cell kind="actions">
              <LanguageRowActions
                code={language.code}
                name={language.name}
                status={language.status}
                candidates={language.candidates}
                ready={language.phrases === phraseKeysFor(language.code).length && language.checked === phraseKeysFor(language.code).length}
              />
            </Cell>
          </Row>
        ))}
      </Table>
    </>
  );
}

function PhraseState({ language }: { language: ManagedLanguage }) {
  const total = phraseKeysFor(language.code).length;
  if (language.phrases === 0) return <Badge tone="warning">Not drafted yet</Badge>;
  if (language.phrases < total) return <Badge tone="warning">{`${language.phrases} of ${total} written`}</Badge>;
  if (language.checked === total) return <Badge tone="success">All checked</Badge>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge tone="warning">Not checked</Badge>
      <span className="text-xs text-slate-600">{`${language.checked} of ${total} checked`}</span>
    </span>
  );
}
