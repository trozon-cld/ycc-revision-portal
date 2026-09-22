import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <p className="text-lg text-gray-900">YCC Revision Portal</p>
      <Link
        href="/login"
        className="rounded-lg bg-gray-900 px-5 py-3 text-base font-medium text-white hover:bg-gray-700"
      >
        Log in
      </Link>
    </div>
  );
}
