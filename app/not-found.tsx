import Link from "next/link";
import { PRIMARY_BUTTON } from "@/components/candidate/buttons";

// An address outside the candidate and staff areas. The start page sends signed-in people to their own area.
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-3xl font-bold text-ink">We can’t find that page</h1>
      <p className="max-w-sm text-lg text-muted">The link may be wrong, or the page may have moved.</p>
      <Link href="/" className={PRIMARY_BUTTON}>
        Go to the start page
      </Link>
    </main>
  );
}
