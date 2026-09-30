import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { loadCandidateBook } from "@/lib/content/candidate-book";
import { PrepareReader } from "./prepare-reader";

export default async function PreparePage() {
  const session = await requireRole(["candidate"]);
  const book = await loadCandidateBook(session.sub);
  if (!book) redirect(SESSION_ENDED_LOGIN);

  if (book.pages.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-10 sm:pt-8">
        <h1 className="text-3xl font-bold text-ink">Prepare</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink">
          The Handbook for {book.categoryName} isn’t ready yet. Please check back soon.
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-flex min-h-14 items-center justify-center rounded-lg bg-primary px-6 text-lg font-semibold text-white hover:bg-primary/90 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-var(--candidate-header))] min-h-[480px] flex-col lg:h-dvh phone-upright:h-dvh phone-sideways:h-dvh phone-sideways:min-h-0">
      <h1 className="sr-only">Prepare: Handbook for {book.categoryName}</h1>
      <PrepareReader
        pages={book.pages}
        media={book.media}
        startPageId={book.startPageId}
        initialTextSize={book.textSize}
        covers={book.covers}
      />
    </div>
  );
}
