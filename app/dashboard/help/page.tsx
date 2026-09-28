import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { PageBody } from "@/components/candidate/page-body";

export default async function CandidateHelpPage() {
  await requireRole(["candidate"]);
  return (
    <PageBody>
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold text-ink">Help</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink">
          Answers to common questions will appear here soon. If you need help now, please contact the
          person who gave you your login details.
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-flex min-h-14 items-center justify-center rounded-lg bg-primary px-6 text-lg font-semibold text-white hover:bg-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Back to home
        </Link>
      </div>
    </PageBody>
  );
}
