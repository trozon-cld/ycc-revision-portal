import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Page not found" };

// Any other /dashboard address shows the candidate "not found" page.
export default async function UnknownCandidatePage() {
  await requireRole(["candidate"]);
  notFound();
}
