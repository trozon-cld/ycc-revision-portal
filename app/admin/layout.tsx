import { requireRole } from "@/lib/auth/guard";
import { AdminShell } from "@/components/admin/shell";

// Every page below still calls requireRole itself for its own, narrower check.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireRole(["admin", "superadmin"]);
  const role = session.role === "superadmin" ? "superadmin" : "admin";

  return (
    <AdminShell role={role} email={session.email}>
      {children}
    </AdminShell>
  );
}
