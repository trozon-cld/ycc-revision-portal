import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { formatUkDate, formatUkTime } from "@/lib/candidates/access";
import { loadCandidateDetail } from "@/lib/candidates/detail";
import { candidateProgressPath } from "@/lib/candidates/paths";
import { countOf, formatDuration } from "@/lib/format";
import { loadMockHistory } from "@/lib/mock/attempts";
import { READINESS_TARGET, scorePercent, scoreText, type MockEnd, type MockHistoryEntry } from "@/lib/mock/types";
import { firstParam } from "@/lib/params";
import { loadProgress } from "@/lib/progress/overview";
import { Badge } from "@/components/admin/badge";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination, pageFromParam } from "@/components/admin/pagination";
import { buttonClass, cardClass } from "@/components/admin/styles";
import { Cell, Row, Table } from "@/components/admin/table";
import { CandidateStatusBadge } from "../status-badge";

const HISTORY_PAGE_SIZE = 10;

// How a test ended, as staff read it.
const ENDED: Record<MockEnd, string> = {
  submitted: "Submitted",
  time_up: "Time ran out",
  away: "Time ran out while away",
  moved: "Ended by a category change",
};

const score = (entry: Pick<MockHistoryEntry, "rightCount" | "outOf">) => scoreText(entry.rightCount, entry.outOf);

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h3 id={id} className="text-base font-semibold text-ink">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Summary({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className={`${cardClass} grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3`}>
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-slate-600">{label}</dt>
          <dd className="mt-0.5 font-medium text-ink [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// A candidate's progress for staff: Admins see their own candidates, the Superadmin everyone's. Read only.
export default async function CandidateProgressPage({ params, searchParams }: PageProps<"/admin/candidates/[id]">) {
  const session = await requireRole(["admin", "superadmin"]);
  const { id } = await params;
  const candidate = await loadCandidateDetail(id, session);
  if (!candidate) notFound();
  const query = await searchParams;

  const asked = firstParam(query.category);
  const category = candidate.groupCategories.find((item) => item.id === asked) ?? candidate.groupCategories.find((item) => item.isCurrent)!;
  const progress = await loadProgress(candidate.id, category.id);
  if (!progress) notFound();
  const { handbook, practice, mock, readiness } = progress;
  const page = pageFromParam(firstParam(query.page), mock.count, HISTORY_PAGE_SIZE);
  const history = await loadMockHistory(candidate.id, HISTORY_PAGE_SIZE, { categoryId: category.id, offset: (page - 1) * HISTORY_PAGE_SIZE });

  const isExpired = candidate.accessExpiresAt !== null && candidate.accessExpiresAt.getTime() <= Date.now();
  const path = candidateProgressPath(candidate.id);
  const categoryQuery: Record<string, string> = { category: category.isCurrent ? "" : category.id };
  const last = mock.items[0];

  return (
    <>
      <Link href="/admin/candidates" className={`${buttonClass("ghost", "sm")} mb-3 -ml-2.5`}>
        ← Candidates
      </Link>
      <PageHeader title={candidate.name ?? candidate.email} description={candidate.name ? candidate.email : "No name yet"} />

      <div className="space-y-8">
        <Summary
          items={[
            ["Status", <CandidateStatusBadge key="status" isBlocked={candidate.isBlocked} isExpired={isExpired} />],
            ["Access until", candidate.accessExpiresAt ? formatUkDate(candidate.accessExpiresAt, "long") : "No expiry"],
            ["Last login", candidate.lastLoginAt ? `${formatUkDate(candidate.lastLoginAt, "long")} at ${formatUkTime(candidate.lastLoginAt)}` : "No logins recorded"],
            ["Assigned category", candidate.assigned.name],
            ["Current category", candidate.current.name],
            ...(session.role === "superadmin" ? [["Admin", candidate.admin.name ? `${candidate.admin.name} (${candidate.admin.email})` : candidate.admin.email] as [string, string]] : []),
          ]}
        />

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-2 text-lg font-semibold text-ink">Progress in {category.name}</h2>
            {candidate.groupCategories.length > 1 && (
              <nav aria-label="Choose a category" className="flex flex-wrap gap-2">
                {candidate.groupCategories.map((item) => (
                  <Link
                    key={item.id}
                    href={item.isCurrent ? path : `${path}?category=${item.id}`}
                    aria-current={item.id === category.id ? "page" : undefined}
                    className={buttonClass(item.id === category.id ? "primary" : "secondary", "sm")}
                  >
                    {item.name}
                    {item.isCurrent && <span className="sr-only"> (current category)</span>}
                    {item.isCurrent && <span aria-hidden="true">·&nbsp;current</span>}
                  </Link>
                ))}
              </nav>
            )}
          </div>
          <p className="text-sm text-slate-600">Each category has its own Handbook progress, Practice results and mock tests.</p>
        </div>

        <Section id="readiness-heading" title="Readiness">
          {readiness ? (
            <div className={`${cardClass} p-4`}>
              <p className="text-sm text-ink">
                <span className="text-2xl font-semibold">{readiness.score}%</span> · {readiness.label}
              </p>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {readiness.parts.map((part) => (
                  <div key={part.key} className="flex justify-between gap-4 border-t border-slate-100 pt-2">
                    <dt className="text-slate-600">
                      {part.name} ({Math.round(part.weight * 100)}%)
                    </dt>
                    <dd className="font-medium text-ink">{part.percent}%</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p className="text-sm text-slate-600">No readiness score yet: it appears after the first mock test in this category.</p>
          )}
        </Section>

        <Section id="handbook-heading" title="Handbook">
          {handbook.total === 0 ? (
            <p className="text-sm text-slate-600">This category has no Handbook yet.</p>
          ) : (
            <>
              <p className="text-sm text-ink">
                {scorePercent(handbook.done, handbook.total)}% done · {handbook.done} of {handbook.total} pages and questions
              </p>
              <Table columns={["Chapter", "Done"]} isEmpty={false} emptyMessage="">
                {handbook.chapters.map((chapter) => (
                  <Row key={chapter.id}>
                    <Cell kind="primary">{chapter.label}</Cell>
                    <Cell label="Done" nowrap>
                      {chapter.done} of {chapter.total}
                    </Cell>
                  </Row>
                ))}
              </Table>
            </>
          )}
        </Section>

        <Section id="practice-heading" title="Practice">
          {practice.pool === 0 ? (
            <p className="text-sm text-slate-600">This category has no practice questions yet.</p>
          ) : (
            <>
              <p className="text-sm text-ink">
                {practice.practised} of {countOf(practice.pool, "question")} practised
                {practice.tries > 0 && ` · ${scorePercent(practice.right, practice.tries)}% of answers right (${practice.right} of ${practice.tries})`}
                {` · ${practice.flagged} flagged`}
              </p>
              <Table columns={["Chapter", "Practised", "Right", "Area"]} isEmpty={false} emptyMessage="">
                {practice.chapters.map((chapter) => (
                  <Row key={chapter.id}>
                    <Cell kind="primary">{chapter.label}</Cell>
                    <Cell label="Practised" nowrap>
                      {chapter.answered} of {chapter.pool}
                    </Cell>
                    <Cell label="Right" nowrap>
                      {chapter.tries > 0 ? `${chapter.right} of ${chapter.tries} (${scorePercent(chapter.right, chapter.tries)}%)` : "—"}
                    </Cell>
                    <Cell label="Area" nowrap>
                      {chapter.area === "weak" ? <Badge tone="warning">Weak</Badge> : chapter.area === "strong" ? <Badge tone="success">Strong</Badge> : "—"}
                    </Cell>
                  </Row>
                ))}
              </Table>
            </>
          )}
        </Section>

        <Section id="mock-heading" title="Mock tests">
          {mock.count === 0 ? (
            <p className="text-sm text-slate-600">No mock tests in this category yet.</p>
          ) : (
            <>
              <Summary
                items={[
                  ["Tests taken", String(mock.count)],
                  ["Last score", last ? score(last) : "—"],
                  ["Average score", `${mock.averagePercent ?? 0}%`],
                  ["Best score", mock.best ? score(mock.best) : "—"],
                ]}
              />
              <Table columns={["Date", "Score", "Time taken", "How it ended"]} isEmpty={false} emptyMessage="">
                {history.items.map((entry) => (
                  <Row key={entry.id}>
                    <Cell kind="primary">
                      {formatUkDate(entry.endedAt, "long")} at {formatUkTime(entry.endedAt)}
                    </Cell>
                    <Cell label="Score" nowrap>
                      {score(entry)}
                      {entry.outOf > 0 && entry.rightCount / entry.outOf >= READINESS_TARGET && (
                        <span className="ml-1">
                          {" "}
                          <Badge tone="success">Target reached</Badge>
                        </span>
                      )}
                    </Cell>
                    <Cell label="Time taken" nowrap>
                      {formatDuration(entry.secondsTaken)}
                    </Cell>
                    <Cell label="How it ended">{ENDED[entry.how]}</Cell>
                  </Row>
                ))}
              </Table>
              <Pagination
                basePath={path}
                page={page}
                hasMore={page * HISTORY_PAGE_SIZE < mock.count}
                query={categoryQuery}
                total={mock.count}
                pageSize={HISTORY_PAGE_SIZE}
              />
            </>
          )}
        </Section>
      </div>
    </>
  );
}
