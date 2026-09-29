import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { ACCESS_TIME_ZONE, daysLeftUk } from "@/lib/candidates/access";
import { loadCandidateHome } from "@/lib/candidates/home";
import { PageBody } from "@/components/candidate/page-body";
import { SectionCard, SectionIcons } from "@/components/candidate/section-card";

// Days left at which the access notice turns amber.
const ACCESS_WARNING_DAYS = 7;

export default async function CandidateHomePage({ searchParams }: PageProps<"/dashboard">) {
  const session = await requireRole(["candidate"]);
  const home = await loadCandidateHome(session.sub);
  if (!home) redirect(SESSION_ENDED_LOGIN);
  const justSwitched = (await searchParams).switched === "1";

  const daysLeft = home.accessExpiresAt ? daysLeftUk(home.accessExpiresAt) : null;
  const expiryLabel = home.accessExpiresAt
    ? new Date(home.accessExpiresAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: ACCESS_TIME_ZONE,
      })
    : null;
  const warn = daysLeft !== null && daysLeft <= ACCESS_WARNING_DAYS;

  return (
    <PageBody>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold text-ink [overflow-wrap:anywhere]">{home.name ? `Welcome, ${home.name}` : "Welcome"}</h1>
          <p className="mt-1 text-lg text-ink/80 [overflow-wrap:anywhere]">{home.email}</p>
        </div>

        {justSwitched && (
          <p role="status" className="rounded-xl border-2 border-green-700 bg-green-50 p-4 text-lg font-semibold text-green-900">
            You’re now studying {home.current.name}.
          </p>
        )}

        {expiryLabel && daysLeft !== null && (
          <div
            className={`rounded-xl border-2 p-5 text-lg leading-relaxed ${
              warn ? "border-amber-500 bg-amber-50 text-amber-950" : "border-primary/30 bg-primary/5 text-ink"
            }`}
          >
            <p className="font-bold">{daysLeftText(daysLeft)}</p>
            <p className="mt-1">
              Your revision access is active until {expiryLabel}. Please complete your study and mock tests before
              this date.
            </p>
          </div>
        )}

        <section aria-labelledby="studying-heading" className="rounded-xl border-2 border-ink/15 bg-white p-5">
          <h2 id="studying-heading" className="text-base font-semibold text-ink/80">
            You’re studying
          </h2>
          <p className="mt-1 text-2xl font-bold text-ink [overflow-wrap:anywhere]">{home.current.name}</p>
          <p className="mt-1 text-base text-ink/80">Group: {home.current.groupName}</p>
          {home.choices > 1 && (
            <Link
              href="/dashboard/category"
              className="mt-4 inline-flex min-h-14 items-center justify-center rounded-lg border-2 border-primary bg-white px-6 text-lg font-semibold text-primary hover:bg-primary/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Change category
            </Link>
          )}
        </section>

        <section aria-labelledby="sections-heading">
          <h2 id="sections-heading" className="mb-4 text-2xl font-bold text-ink">
            What would you like to do?
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            <li>
              <SectionCard
                title="General queries"
                description="Answers to common questions and how to get help."
                icon={SectionIcons.help}
              />
            </li>
            <li>
              <SectionCard
                title="Prepare"
                description="Read the Handbook chapter by chapter, with questions along the way."
                icon={SectionIcons.book}
                href="/dashboard/prepare"
              />
            </li>
            <li>
              <SectionCard
                title="Practice"
                description="Answer questions at your own pace and see the right answer each time."
                icon={SectionIcons.practice}
              />
            </li>
            <li>
              <SectionCard
                title="Mock test"
                description="A timed test in exam-style conditions, with your results at the end."
                icon={SectionIcons.timer}
              />
            </li>
            <li className="sm:col-span-2">
              <SectionCard
                title="My progress"
                description="Your results from every section in one place."
                icon={SectionIcons.progress}
              />
            </li>
          </ul>
        </section>

        <p className="text-base text-ink/80">Designed to help you prepare with confidence.</p>
      </div>
    </PageBody>
  );
}

function daysLeftText(days: number): string {
  if (days <= 0) return "Today is the last day of your access.";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}
