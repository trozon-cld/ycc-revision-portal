import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LogoutButton } from "@/components/logout-button";

// Placeholder landing page — proves Superadmin/Admin login + role gating
// works. The real candidate/admin management UI is next (Stage 3 proper).
export default async function AdminHome() {
  const session = await getSession();

  if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-base uppercase tracking-wide text-gray-500">
        {session.role === "superadmin" ? "Superadmin" : "Admin"} area
      </p>
      <h1 className="text-2xl font-semibold text-gray-900">
        Logged in as {session.email}
      </h1>
      <p className="max-w-sm text-base text-gray-600">
        This is a placeholder — candidate/admin management comes next.
      </p>
      <LogoutButton />
    </div>
  );
}
