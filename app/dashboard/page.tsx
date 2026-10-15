import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { daysLeftUk, formatUkDate } from "@/lib/candidates/access";
import { loadCandidateHome } from "@/lib/candidates/home";
import { loadMockInProgress, settleOwnMocks } from "@/lib/mock/attempts";
import { donePercent, scoreText, timeLeftText } from "@/lib/mock/types";
import { loadPracticeInProgress } from "@/lib/practice/sessions";
import { loadProgress } from "@/lib/progress/overview";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { PageBody } from "@/components/candidate/page-body";
import { SectionCard, SectionIcons } from "@/components/candidate/section-card";

export const metadata: Metadata = { title: "Home" };

// Days left at which the access notice turns amber.
const ACCESS_WARNING_DAYS = 7;

export default async function CandidateHomePage({ searchParams }: PageProps<"/dashboard">) {
  const session = await requireRole(["candidate"]);
  await settleOwnMocks(session.sub);
  const [home, practice, mock, progress] = await Promise.all([
    loadCandidateHome(session.sub),
    loadPracticeInProgress(session.sub),
    loadMockInProgress(session.sub),
    loadProgress(session.sub),
  ]);
  const lastMock = progress?.mock.items[0];
  const readiness = progress?.readiness;
  if (!home) redirect(SESSION_ENDED_LOGIN);
  const justSwitched = (await searchParams).switched === "1";
  // A first visit (nothing read, practised or tested yet): point to where to begin.
  const startHere =
    progress && !practice && !mock && progress.handbook.done === 0 && progress.practice.tries === 0 && progress.mock.count === 0
      ? progress.handbook.total > 0
        ? { href: "/dashboard/prepare", text: "New here? Start by reading the Handbook in Prepare, then try Practice and a mock test.", button: "Start reading" }
        : progress.practice.pool > 0
          ? { href: "/dashboard/practice", text: "New here? Start with some Practice questions, then try a mock test.", button: "Start practising" }
          : null
      : null;
  const handbookShare = progress && progress.handbook.done > 0 && progress.handbook.total > 0 ? donePercent(progress.handbook.done, progress.handbook.total) : null;

  const daysLeft = home.accessExpiresAt ? daysLeftUk(home.accessExpiresAt) : null;
  const expiryLabel = home.accessExpiresAt
    ? formatUkDate(home.accessExpiresAt, "long")
    : null;
  const warn = daysLeft !== null && daysLeft <= ACCESS_WARNING_DAYS;

  return (
    <PageBody>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold text-ink [overflow-wrap:anywhere]">{home.name ? `Welcome, ${home.name}` : "Welcome"}</h1>
          <p className="mt-1 text-lg text-muted [overflow-wrap:anywhere]">{home.email}</p>
        </div>

        {justSwitched && (
          <p role="status" className="rounded-xl border-2 border-ok bg-ok-bg p-4 text-lg font-semibold text-ok-strong">
            You’re now studying {home.current.name}.
          </p>
        )}

        {expiryLabel && daysLeft !== null && (
          <div
            className={`rounded-xl border-2 p-5 text-lg leading-relaxed ${
              warn ? "border-warn bg-warn-bg text-warn-strong" : "border-primary/30 bg-primary/5 text-ink"
            }`}
          >
            <p className="font-bold">{daysLeftText(daysLeft)}</p>
            <p className="mt-1">
              Your revision access is active until {expiryLabel}. Please complete your study and mock tests before
              this date.
            </p>
          </div>
        )}

        <section aria-labelledby="studying-heading" className={`${CARD} p-5`}>
          <h2 id="studying-heading" className="text-base font-semibold text-muted">
            You’re studying
          </h2>
          <p className="mt-1 text-2xl font-bold text-ink [overflow-wrap:anywhere]">{home.current.name}</p>
          <p className="mt-1 text-base text-muted">Group: {home.current.groupName}</p>
          {home.choices > 1 && (
            <Link href="/dashboard/category" className={`${SECONDARY_BUTTON} mt-4 w-full sm:w-auto`}>
              Change category
            </Link>
          )}
        </section>

        {startHere && (
          <section aria-labelledby="start-heading" className="rounded-xl border-2 border-primary bg-primary/5 p-5">
            <h2 id="start-heading" className="text-xl font-bold text-ink">
              Where to start
            </h2>
            <p className="mt-2 text-lg leading-relaxed text-ink">{startHere.text}</p>
            <Link href={startHere.href} className={`${PRIMARY_BUTTON} mt-4 w-full sm:w-auto`}>
              {startHere.button}
            </Link>
          </section>
        )}

        <section aria-labelledby="sections-heading">
          <h2 id="sections-heading" className="mb-4 text-2xl font-bold text-ink">
            What would you like to do?
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            <li>
              <SectionCard
                title="Help: general queries"
                description="Answers to common questions and how to get help."
                icon={SectionIcons.help}
                href="/dashboard/help"
              />
            </li>
            <li>
              <SectionCard
                title="Prepare"
                description={
                  handbookShare === null
                    ? "Read the Handbook chapter by chapter, with questions along the way."
                    : `Continue reading: ${handbookShare}% done.`
                }
                icon={SectionIcons.book}
                href="/dashboard/prepare"
              />
            </li>
            <li>
              <SectionCard
                title="Practice"
                description={
                  practice
                    ? `Continue your practice: question ${Math.min(practice.position + 1, practice.total)} of ${practice.total}.`
                    : "Answer questions at your own pace and see the right answer each time."
                }
                icon={SectionIcons.practice}
                href={practice ? `/dashboard/practice/${practice.id}` : "/dashboard/practice"}
              />
            </li>
            <li>
              <SectionCard
                title="Mock test"
                description={
                  mock
                    ? `Continue your mock test: ${timeLeftText(mock.secondsLeft).toLowerCase()}.`
                    : lastMock
                      ? `Last mock test: ${scoreText(lastMock.rightCount, lastMock.outOf)}.`
                      : "A timed test in exam-style conditions, with your results at the end."
                }
                icon={SectionIcons.timer}
                href={mock ? `/dashboard/mock/${mock.id}` : "/dashboard/mock"}
              />
            </li>
            <li className="sm:col-span-2">
              <SectionCard
                title="My progress"
                description={readiness ? `Readiness: ${readiness.score}% · ${readiness.label}` : "Your results from every section in one place."}
                icon={SectionIcons.progress}
                href="/dashboard/progress"
              />
            </li>
          </ul>
        </section>

        <p className="text-base text-muted">Designed to help you prepare with confidence.</p>
      </div>
    </PageBody>
  );
}

function daysLeftText(days: number): string {
  if (days <= 0) return "Today is the last day of your access.";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}
