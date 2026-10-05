import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { loadMockHome } from "@/lib/mock/attempts";
import { MOCK_QUESTIONS, timeLeftText } from "@/lib/mock/types";
import { PageBody } from "@/components/candidate/page-body";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { FocusedShell } from "@/components/learning/focused-shell";
import { StartMock } from "./start-mock";

const HOW_IT_WORKS = [
  "One question at a time. You can go back and change your answers before you submit.",
  "Flag any question you want to look at again.",
  "Your answers are saved as you go.",
  "The timer keeps running if you leave the page or close it.",
  "When time is up, your test is submitted automatically.",
];

export default async function MockTestPage() {
  const session = await requireRole(["candidate"]);
  const home = await loadMockHome(session.sub);
  if (!home) redirect(SESSION_ENDED_LOGIN);

  return (
    <FocusedShell label="Mock test tools" status="Mock test">
      <PageBody>
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold text-ink">Mock test</h1>
          <p className="mt-1 text-base text-ink/80 [overflow-wrap:anywhere]">Questions for {home.categoryName}</p>

          {home.open ? (
            <section aria-labelledby="open-heading" className="mt-6 rounded-xl border-2 border-primary bg-primary/5 p-5">
              <h2 id="open-heading" className="text-xl font-bold text-ink">
                Mock test in progress
              </h2>
              <p className="mt-1 text-lg text-ink">
                {timeLeftText(home.open.secondsLeft)} · {home.open.answered} of {home.open.total} answered
              </p>
              <Link href={`/dashboard/mock/${home.open.id}`} className={`${PRIMARY_BUTTON} mt-4 w-full sm:w-auto`}>
                Continue mock test
              </Link>
              <p className="mt-3 text-base text-ink/80">The timer keeps running until you submit or the time is up.</p>
            </section>
          ) : home.size === 0 ? (
            <p className="mt-6 text-lg leading-relaxed text-ink">
              There are no mock test questions for {home.categoryName} yet. Please check back soon.
            </p>
          ) : (
            <>
              <p className="mt-6 rounded-xl border-2 border-primary/30 bg-primary/5 p-5 text-lg leading-relaxed text-ink">
                This mock test is timed to help you practise under exam-style conditions. You will have {home.minutes} minutes to
                complete {home.size} questions.
              </p>
              {home.size < MOCK_QUESTIONS && (
                <p className="mt-3 text-base leading-relaxed text-ink/80">
                  A full mock test has {MOCK_QUESTIONS} questions. This one is shorter because there are only {home.size} mock test
                  questions for {home.categoryName} so far.
                </p>
              )}
              <h2 className="mt-8 text-xl font-bold text-ink">How it works</h2>
              <ul className="mt-3 flex list-disc flex-col gap-2 pl-6 text-lg leading-relaxed text-ink">
                {HOW_IT_WORKS.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <StartMock />
            </>
          )}

          <Link href="/dashboard" className={`${!home.open && home.size === 0 ? PRIMARY_BUTTON : SECONDARY_BUTTON} mt-3 w-full sm:w-auto`}>
            Back to home
          </Link>
        </div>
      </PageBody>
    </FocusedShell>
  );
}
