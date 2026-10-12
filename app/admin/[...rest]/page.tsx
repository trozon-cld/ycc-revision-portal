import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";

// Any other /admin address shows the staff "not found" page.
export default async function UnknownAdminPage() {
  await requireRole(["admin", "superadmin"]);
  notFound();
}
