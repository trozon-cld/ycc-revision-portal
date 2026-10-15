import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { loadFaqItems, loadOwnAdminName, loadSupportContact } from "@/lib/faq/load";
import { PageBody } from "@/components/candidate/page-body";
import { CARD, PAGE_TITLE, PRIMARY_BUTTON, SECONDARY_BUTTON, SECTION_TITLE } from "@/components/candidate/buttons";
import { loadMockInProgress } from "@/lib/mock/attempts";
import { loadPracticeInProgress } from "@/lib/practice/sessions";
import { Icon } from "@/components/icons";

export const metadata: Metadata = { title: "Help: general queries" };

const LINK = "inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4 [overflow-wrap:anywhere] hover:no-underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary";

// A dialable number: digits and a leading +; the UK "(0)" after a country code isn't dialled.
function telHref(phone: string): string {
  const international = phone.trim().startsWith("+");
  const digits = (international ? phone.replace(/\(0\)/g, "") : phone).replace(/[^0-9]/g, "");
  return `tel:${international ? "+" : ""}${digits}`;
}

// Help: general queries — the questions the Superadmin has shown, then who to contact.
export default async function CandidateHelpPage() {
  const session = await requireRole(["candidate"]);
  const [items, contact, adminName, mock, practice] = await Promise.all([
    loadFaqItems(true),
    loadSupportContact(),
    loadOwnAdminName(session.sub),
    loadMockInProgress(session.sub),
    loadPracticeInProgress(session.sub),
  ]);
  // Opened from a test or practice in progress: the way back to it comes first.
  const resume = mock
    ? { href: `/dashboard/mock/${mock.id}`, label: "Back to your mock test" }
    : practice
      ? { href: `/dashboard/practice/${practice.id}`, label: "Back to your practice" }
      : null;
  const hasSupport = Boolean(contact.email || contact.phone || contact.hours || contact.note);

  return (
    <PageBody>
      <div className="max-w-3xl">
        <h1 className={`${PAGE_TITLE}`}>Help: general queries</h1>
        <p className="mt-2 text-base text-ink">Answers to common questions about using the portal. Tap a question to see its answer.</p>

        {items.length === 0 ? (
          <p className={`mt-5 lg:mt-6 ${CARD} p-4 lg:p-5 text-base text-ink`}>There are no questions here yet.</p>
        ) : (
          <ul className="mt-5 lg:mt-6 space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <details className={`group ${CARD} open:border-primary/50`}>
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-3 text-base font-semibold text-ink hover:bg-primary/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                    <span className="[overflow-wrap:anywhere]">{item.question}</span>
                    <Icon name="expand" className="text-primary transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                  </summary>
                  <div className="space-y-3 px-5 pb-5 text-base leading-relaxed text-ink">
                    {item.answer.split("\n\n").map((paragraph, index) => (
                      <p key={index} className="whitespace-pre-line [overflow-wrap:anywhere]">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}

        <section aria-labelledby="contact-heading" className={`mt-5 lg:mt-6 ${CARD} p-4 lg:p-5`}>
          <h2 id="contact-heading" className={`${SECTION_TITLE}`}>
            Need more help?
          </h2>
          <p className="mt-2 text-base text-ink">
            {adminName ? (
              <>
                Your Admin is <strong className="[overflow-wrap:anywhere]">{adminName}</strong>. They can help with your login, your access dates and your category.
              </>
            ) : (
              "Your Admin can help with your login, your access dates and your category."
            )}
          </p>
          {hasSupport ? (
            <dl className="mt-4 divide-y divide-ink/10 border-t border-ink/10 text-base text-ink">
              {contact.email && (
                <div className="py-3">
                  <dt className="text-base text-muted">Email</dt>
                  <dd>
                    <a href={`mailto:${contact.email}`} className={LINK}>
                      {contact.email}
                    </a>
                  </dd>
                </div>
              )}
              {contact.phone && (
                <div className="py-3">
                  <dt className="text-base text-muted">Phone</dt>
                  <dd>
                    <a href={telHref(contact.phone)} className={LINK}>
                      {contact.phone}
                    </a>
                  </dd>
                </div>
              )}
              {contact.hours && (
                <div className="py-3">
                  <dt className="text-base text-muted">Opening hours</dt>
                  <dd className="[overflow-wrap:anywhere]">{contact.hours}</dd>
                </div>
              )}
              {contact.note && (
                <div className="py-3">
                  <dt className="sr-only">Note</dt>
                  <dd className="whitespace-pre-line [overflow-wrap:anywhere]">{contact.note}</dd>
                </div>
              )}
            </dl>
          ) : (
            !adminName && <p className="mt-2 text-base text-ink">If you need help now, please contact the person who gave you your login details.</p>
          )}
        </section>

        <div className="mt-5 lg:mt-6 flex flex-col gap-3 sm:flex-row">
          {resume && (
            <Link href={resume.href} className={`${PRIMARY_BUTTON} w-full sm:w-auto`}>
              {resume.label}
            </Link>
          )}
          <Link href="/dashboard" className={`${resume ? SECONDARY_BUTTON : PRIMARY_BUTTON} w-full sm:w-auto`}>
            Back to home
          </Link>
        </div>
      </div>
    </PageBody>
  );
}
