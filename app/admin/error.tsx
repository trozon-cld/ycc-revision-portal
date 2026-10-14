"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonClass, cardClass } from "@/components/admin/styles";

// A staff page that failed to load (e.g. the database couldn't be reached); the sidebar stays.
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={`${cardClass} max-w-xl p-6`}>
      <h1 className="text-xl font-semibold text-ink">This page couldn&apos;t load</h1>
      <p role="alert" className="mt-2 text-sm text-slate-700">
        Something went wrong on our side, or the connection dropped. Anything already saved is safe.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={() => retry()} className={buttonClass("primary")}>
          Try again
        </button>
        <Link href="/admin" className={buttonClass("secondary")}>
          Back to main list
        </Link>
      </div>
      {error.digest && <p className="mt-5 text-xs text-slate-600">Reference: {error.digest}</p>}
    </div>
  );
}
