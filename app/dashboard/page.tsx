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
import { firstName } from "@/lib/text";
import { BAR_FILL, BAR_TRACK, CARD, NOTE_BOX, OK_BOX, PAGE_TITLE, PRIMARY_BUTTON, SECONDARY_BUTTON, SECTION_TITLE, WARN_BOX } from "@/components/candidate/buttons";
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
  const greetingName = firstName(home.name);

  return (
    <PageBody>
      <div className="flex flex-col gap-5 lg:gap-6">
        <div>
          <h1 className={`${PAGE_TITLE} [overflow-wrap:anywhere]`}>{greetingName ? `Welcome, ${greetingName}` : "Welcome"}</h1>
          {expiryLabel && daysLeft !== null && !warn && (
            <p className="mt-1 text-base text-muted">
              Access until {expiryLabel} ({daysLeft === 1 ? "1 day" : `${daysLeft} days`} left)
            </p>
          )}
        </div>

        {justSwitched && (
          <p role="status" className={`${OK_BOX} p-4 text-base font-semibold`}>
            You’re now studying {home.current.name}.
          </p>
        )}

        {expiryLabel && daysLeft !== null && warn && (
          <div className={`${WARN_BOX} p-4 text-base leading-relaxed lg:p-5`}>
            <p className="font-bold">{daysLeftText(daysLeft)}</p>
            <p className="mt-1">
              Your revision access is active until {expiryLabel}. Please complete your study and mock tests before
              this date.
            </p>
          </div>
        )}

        {startHere && (
          <section aria-labelledby="start-heading" className={`${NOTE_BOX} p-4 lg:p-5`}>
            <h2 id="start-heading" className="text-xl font-bold text-ink">
              Where to start
            </h2>
            <p className="mt-2 text-base leading-relaxed text-ink">{startHere.text}</p>
            <Link href={startHere.href} className={`${PRIMARY_BUTTON} mt-4 w-full sm:w-auto`}>
              {startHere.button}
            </Link>
          </section>
        )}

        <section aria-labelledby="sections-heading">
          <h2 id="sections-heading" className={`mb-4 ${SECTION_TITLE}`}>
            What would you like to do?
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:gap-4">
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
            <li>
              <SectionCard
                title="My progress"
                description="Your results from every section in one place."
                icon={SectionIcons.progress}
                href="/dashboard/progress"
              />
            </li>
          </ul>
        </section>

        <section aria-labelledby="studying-heading" className={`${CARD} flex flex-wrap items-center justify-between gap-x-4 gap-y-3 p-4 lg:p-5`}>
          <div className="min-w-0">
            <h2 id="studying-heading" className="text-base font-semibold text-muted">
              You’re studying
            </h2>
            <p className="text-lg font-bold text-ink [overflow-wrap:anywhere]">{home.current.name}</p>
            <p className="text-base text-muted">Group: {home.current.testAreaName}</p>
          </div>
          {home.choices > 1 && (
            <Link href="/dashboard/test-type" className={`${SECONDARY_BUTTON} shrink-0`}>
              Change<span className="sr-only"> category</span>
            </Link>
          )}
        </section>

        {readiness && (
          <Link
            href="/dashboard/progress"
            className={`${CARD} block p-4 lg:p-5 hover:border-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary`}
          >
            <span className="block text-base font-semibold text-muted">Your readiness</span>
            <span className={`mt-1 block ${SECTION_TITLE}`}>
              {readiness.score}% · {readiness.label}
            </span>
            <span aria-hidden="true" className={`${BAR_TRACK} mt-3 block h-3.5`}>
              <span className={`${BAR_FILL} block`} style={{ width: `${Math.min(100, readiness.score)}%` }} />
            </span>
            <span className="mt-3 block text-base font-semibold text-primary underline underline-offset-4">See My progress</span>
          </Link>
        )}

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
