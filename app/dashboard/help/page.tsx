import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { PageBody } from "@/components/candidate/page-body";
import { PRIMARY_BUTTON } from "@/components/candidate/buttons";

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
          className={`${PRIMARY_BUTTON} mt-8`}
        >
          Back to home
        </Link>
      </div>
    </PageBody>
  );
}
