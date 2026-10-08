import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { loadFaqItems, loadOwnAdminName, loadSupportContact } from "@/lib/faq/load";
import { PageBody } from "@/components/candidate/page-body";
import { PRIMARY_BUTTON } from "@/components/candidate/buttons";

const LINK = "inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4 [overflow-wrap:anywhere] hover:no-underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary";

// A dialable number: digits and a leading +; the UK "(0)" after a country code isn't dialled.
function telHref(phone: string): string {
  const international = phone.trim().startsWith("+");
  const digits = (international ? phone.replace(/\(0\)/g, "") : phone).replace(/[^0-9]/g, "");
  return `tel:${international ? "+" : ""}${digits}`;
}

// General queries: the questions the Superadmin has shown, then who to contact.
export default async function CandidateHelpPage() {
  const session = await requireRole(["candidate"]);
  const [items, contact, adminName] = await Promise.all([loadFaqItems(true), loadSupportContact(), loadOwnAdminName(session.sub)]);
  const hasSupport = Boolean(contact.email || contact.phone || contact.hours || contact.note);

  return (
    <PageBody>
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold text-ink">General queries</h1>
        <p className="mt-2 text-lg text-ink">Answers to common questions about using the portal. Tap a question to see its answer.</p>

        {items.length === 0 ? (
          <p className="mt-6 rounded-xl border-2 border-ink/15 bg-white p-5 text-lg text-ink">There are no questions here yet.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {items.map((item) => (
              <li key={item.id}>
                <details className="group rounded-xl border-2 border-ink/15 bg-white open:border-primary/50">
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-3 text-lg font-semibold text-ink hover:bg-primary/5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                    <span className="[overflow-wrap:anywhere]">{item.question}</span>
                    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-6 shrink-0 text-primary transition-transform group-open:rotate-180 motion-reduce:transition-none">
                      <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </summary>
                  <div className="space-y-3 px-5 pb-5 text-lg leading-relaxed text-ink">
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

        <section aria-labelledby="contact-heading" className="mt-8 rounded-xl border-2 border-ink/15 bg-white p-5">
          <h2 id="contact-heading" className="text-2xl font-bold text-ink">
            Need more help?
          </h2>
          <p className="mt-2 text-lg text-ink">
            {adminName ? (
              <>
                Your Admin is <strong className="[overflow-wrap:anywhere]">{adminName}</strong>. They can help with your login, your access dates and your category.
              </>
            ) : (
              "Your Admin can help with your login, your access dates and your category."
            )}
          </p>
          {hasSupport ? (
            <dl className="mt-4 divide-y divide-ink/10 border-t border-ink/10 text-lg text-ink">
              {contact.email && (
                <div className="py-3">
                  <dt className="text-base text-ink/80">Email</dt>
                  <dd>
                    <a href={`mailto:${contact.email}`} className={LINK}>
                      {contact.email}
                    </a>
                  </dd>
                </div>
              )}
              {contact.phone && (
                <div className="py-3">
                  <dt className="text-base text-ink/80">Phone</dt>
                  <dd>
                    <a href={telHref(contact.phone)} className={LINK}>
                      {contact.phone}
                    </a>
                  </dd>
                </div>
              )}
              {contact.hours && (
                <div className="py-3">
                  <dt className="text-base text-ink/80">Opening hours</dt>
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
            !adminName && <p className="mt-2 text-lg text-ink">If you need help now, please contact the person who gave you your login details.</p>
          )}
        </section>

        <Link href="/dashboard" className={`${PRIMARY_BUTTON} mt-8`}>
          Back to home
        </Link>
      </div>
    </PageBody>
  );
}
