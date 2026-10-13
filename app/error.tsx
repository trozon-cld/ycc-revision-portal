"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";

// A page outside the candidate and staff areas (e.g. the start page) that failed to load.
export default function SiteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-3xl font-bold text-ink">This page couldn’t load</h1>
      <p role="alert" className="max-w-sm text-lg text-ink/80">
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
      {error.digest && <p className="text-base text-ink/80">Reference: {error.digest}</p>}
    </main>
  );
}
