"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CARD, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";

// A page outside the candidate and staff areas (e.g. the start page) that failed to load.
export default function SiteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center bg-page p-4">
      <div className={`${CARD} flex w-full max-w-md flex-col items-center gap-4 p-6 text-center sm:p-8`}>
        <h1 className="text-3xl font-bold text-ink">This page couldn’t load</h1>
        <p role="alert" className="text-lg text-muted">
          Something went wrong on our side, or the connection dropped. Please try again.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => retry()} className={PRIMARY_BUTTON}>
            Try again
          </button>
          <Link href="/" className={SECONDARY_BUTTON}>
            Go to the start page
          </Link>
      </div>
      {error.digest && <p className="text-base text-muted">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
