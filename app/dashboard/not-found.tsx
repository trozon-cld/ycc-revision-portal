import Link from "next/link";
import { PageBody } from "@/components/candidate/page-body";
import { CARD, PAGE_TITLE, PRIMARY_BUTTON } from "@/components/candidate/buttons";

// A removed test or practice, or a mistyped address; shown under the usual header.
export default function CandidateNotFound() {
  return (
    <PageBody>
      <div className={`${CARD} max-w-xl p-6`}>
        <h1 className={`${PAGE_TITLE}`}>We can’t find that page</h1>
        <p className="mt-3 text-base leading-relaxed text-ink">It may have been removed, or the link may be wrong.</p>
        <Link href="/dashboard" className={`${PRIMARY_BUTTON} mt-5 lg:mt-6 w-full sm:w-auto`}>
          Back to home
        </Link>
      </div>
    </PageBody>
  );
}
