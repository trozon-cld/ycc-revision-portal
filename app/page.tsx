import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <p className="text-lg text-ink">YCC Revision Portal</p>
      <Link
        href="/login"
        className="rounded-lg bg-primary px-5 py-3 text-base font-medium text-surface hover:bg-primary/90"
      >
        Log in
      </Link>
    </div>
  );
}
