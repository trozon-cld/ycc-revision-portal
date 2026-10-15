"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PageBody } from "@/components/candidate/page-body";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";

// A candidate page that failed to load (e.g. the database couldn't be reached); the header stays.
export default function CandidateError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageBody>
      <div className="max-w-xl">
        <h1 className="text-3xl font-bold text-ink">This page couldn’t load</h1>
        <p role="alert" className="mt-3 text-lg leading-relaxed text-ink">
          Something went wrong on our side, or the connection dropped. Anything already saved is safe.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => retry()} className={PRIMARY_BUTTON}>
            Try again
          </button>
          <Link href="/dashboard" className={SECONDARY_BUTTON}>
            Back to home
          </Link>
        </div>
        {error.digest && <p className="mt-6 text-base text-muted">Reference: {error.digest}</p>}
      </div>
    </PageBody>
  );
}
