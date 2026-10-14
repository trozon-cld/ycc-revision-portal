import Link from "next/link";
import { buttonClass, cardClass } from "@/components/admin/styles";

// A deleted item or a mistyped staff address; shown inside the console.
export default function AdminNotFound() {
  return (
    <div className={`${cardClass} max-w-xl p-6`}>
      <h1 className="text-xl font-semibold text-ink">We can&apos;t find that page</h1>
      <p className="mt-2 text-sm text-slate-700">It may have been deleted, or the link may be wrong.</p>
      <div className="mt-5">
        <Link href="/admin" className={buttonClass("secondary")}>
          Back to main list
        </Link>
      </div>
    </div>
  );
}
