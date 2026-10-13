import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { preload } from "react-dom";
import { requireRole } from "@/lib/auth/guard";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { coverPreloads, loadCandidateBook } from "@/lib/content/candidate-book";
import { PRIMARY_BUTTON } from "@/components/candidate/buttons";
import { PageBody } from "@/components/candidate/page-body";
import { PrepareReader } from "./prepare-reader";

export const metadata: Metadata = { title: "Prepare" };

export default async function PreparePage() {
  const session = await requireRole(["candidate"]);
  const book = await loadCandidateBook(session.sub);
  if (!book) redirect(SESSION_ENDED_LOGIN);

  if (book.pages.length === 0) {
    return (
      <PageBody>
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold text-ink">Prepare</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink">
            There’s no Handbook for {book.categoryName} yet. Please check back soon.
          </p>
          <Link href="/dashboard" className={`${PRIMARY_BUTTON} mt-8 w-full sm:w-auto`}>
            Back to home
          </Link>
        </div>
      </PageBody>
    );
  }

  // The front cover starts downloading with the page, not once the reader has started.
  for (const { href, priority } of coverPreloads(book)) preload(href, { as: "image", fetchPriority: priority });

  return (
    <div className="flex h-dvh min-h-[480px] flex-col phone-sideways:min-h-0">
      <h1 className="sr-only">Prepare: Handbook for {book.categoryName}</h1>
      <PrepareReader
        categoryId={book.categoryId}
        pages={book.pages}
        media={book.media}
        startPageId={book.startPageId}
        initialTextSize={book.textSize}
        covers={book.covers}
      />
    </div>
  );
}
