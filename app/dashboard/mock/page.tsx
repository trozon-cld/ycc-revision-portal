import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { loadMockHistory, loadMockHome } from "@/lib/mock/attempts";
import { firstParam } from "@/lib/params";
import { MOCK_HISTORY_STEP, MOCK_QUESTIONS, timeLeftText } from "@/lib/mock/types";
import { PageBody } from "@/components/candidate/page-body";
import { INFO_BOX, NOTE_BOX, PAGE_TITLE, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { FocusedShell } from "@/components/learning/focused-shell";
import { Accordion } from "@/components/candidate/accordion";
import { MockHistoryList } from "./mock-history";
import { StartMock } from "./start-mock";

export const metadata: Metadata = { title: "Mock test" };

// Show more stops here.
const HISTORY_MAX = 500;

const HOW_IT_WORKS = [
  "One question at a time. You can go back and change your answers before you submit.",
  "Flag any question you want to look at again.",
  "Your answers are saved as you go.",
  "The timer keeps running if you leave the page or close it.",
  "When time runs out, your test is submitted automatically.",
];

export default async function MockTestPage({ searchParams }: PageProps<"/dashboard/mock">) {
  const session = await requireRole(["candidate"]);
  const home = await loadMockHome(session.sub);
  if (!home) redirect(SESSION_ENDED_LOGIN);
  const asked = Number(firstParam((await searchParams).shown));
  const shown = Number.isInteger(asked) ? Math.min(HISTORY_MAX, Math.max(MOCK_HISTORY_STEP, asked)) : MOCK_HISTORY_STEP;
  const history = await loadMockHistory(session.sub, shown);
  // Opened on purpose (Show more, or "See all your mock tests" from My progress): the history starts open.
  const showing = firstParam((await searchParams).shown) !== undefined;
  const more = history.count > history.items.length && shown < HISTORY_MAX ? `/dashboard/mock?shown=${shown + MOCK_HISTORY_STEP}#history-heading` : null;

  return (
    <FocusedShell label="Mock test tools" status="Mock test">
      <PageBody>
        <div className="max-w-3xl">
          <h1 className={`${PAGE_TITLE}`}>Mock test</h1>
          <p className="mt-1 text-base text-muted [overflow-wrap:anywhere]">Questions for {home.testTypeName}</p>

          {home.open ? (
            <section aria-labelledby="open-heading" className={`mt-5 lg:mt-6 ${NOTE_BOX} p-4 lg:p-5`}>
              <h2 id="open-heading" className="text-xl font-bold text-ink">
                Mock test in progress
              </h2>
              <p className="mt-1 text-base text-ink">
                {timeLeftText(home.open.secondsLeft)} · {home.open.answered} of {home.open.total} answered
              </p>
              <Link href={`/dashboard/mock/${home.open.id}`} className={`${PRIMARY_BUTTON} mt-4 w-full sm:w-auto`}>
                Continue mock test
              </Link>
              <p className="mt-3 text-base text-muted">The timer keeps running until you submit or time runs out.</p>
            </section>
          ) : home.size === 0 ? (
            <p className="mt-5 lg:mt-6 text-base leading-relaxed text-ink">
              There are no mock test questions for {home.testTypeName} yet. Please check back soon.
            </p>
          ) : (
            <>
              <p className={`mt-5 lg:mt-6 ${INFO_BOX} p-4 lg:p-5 text-base leading-relaxed text-ink`}>
                This mock test is timed to help you practise under exam-style conditions. You will have {home.minutes} minutes to
                complete {home.size} questions.
              </p>
              {home.size < MOCK_QUESTIONS && (
                <p className="mt-3 text-base leading-relaxed text-muted">
                  A full mock test has {MOCK_QUESTIONS} questions. This one is shorter because there are only {home.size} mock test
                  questions for {home.testTypeName} so far.
                </p>
              )}
              {/* Open until the first test is taken. */}
              <div className="mt-5 lg:mt-6">
                <Accordion id="how-it-works" title="How it works" open={history.count === 0}>
                  <ul className="flex list-disc flex-col gap-2 pl-6 text-base leading-relaxed text-ink">
                    {HOW_IT_WORKS.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </Accordion>
              </div>
              <StartMock />
            </>
          )}

          <Link href="/dashboard" className={`${!home.open && home.size === 0 ? PRIMARY_BUTTON : SECONDARY_BUTTON} mt-3 w-full sm:w-auto`}>
            Back to home
          </Link>

          {history.count > 0 && <MockHistoryList history={history} moreHref={more} collapse="all" open={showing} />}
        </div>
      </PageBody>
    </FocusedShell>
  );
}
