import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";

// Login always sends admin/superadmin here; route each role straight to
// its own management page.
export default async function AdminIndex() {
  const session = await requireRole(["admin", "superadmin"]);
  redirect(session.role === "superadmin" ? "/admin/admins" : "/admin/candidates");
}
