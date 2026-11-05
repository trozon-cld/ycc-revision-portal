import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { AdminShell } from "@/components/admin/shell";
import { PictureLimitProvider } from "@/components/admin/picture-limit";
import { MAX_PICTURE_BYTES } from "@/lib/hosting";

// Every page below still calls requireRole itself for its own, narrower check.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireRole(["admin", "superadmin"]);
  const role = session.role === "superadmin" ? "superadmin" : "admin";
  // Read live: a name change shows straight away.
  const { rows } = await pool.query<{ full_name: string | null }>(`select full_name from users where id = $1`, [session.sub]);

  return (
    <AdminShell role={role} email={session.email} name={rows[0]?.full_name ?? null}>
      <PictureLimitProvider bytes={MAX_PICTURE_BYTES}>{children}</PictureLimitProvider>
    </AdminShell>
  );
}
