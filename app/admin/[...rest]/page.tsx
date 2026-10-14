import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";

export const metadata: Metadata = { title: "Page not found" };

// Any other /admin address shows the staff "not found" page.
export default async function UnknownAdminPage() {
  await requireRole(["admin", "superadmin"]);
  notFound();
}
