import Link from "next/link";

const SUPERADMIN_LINKS = [
  { href: "/admin/admins", label: "Admins" },
  { href: "/admin/candidates", label: "Candidates" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/activity", label: "Activity" },
  { href: "/admin/account", label: "My account" },
] as const;

const ADMIN_LINKS = [
  { href: "/admin/candidates", label: "Candidates" },
  { href: "/admin/activity", label: "My activity" },
] as const;

type NavHref =
  | (typeof SUPERADMIN_LINKS)[number]["href"]
  | (typeof ADMIN_LINKS)[number]["href"];

export function AreaNav({
  role,
  current,
}: {
  role: "admin" | "superadmin";
  current: NavHref;
}) {
  const links = role === "superadmin" ? SUPERADMIN_LINKS : ADMIN_LINKS;

  return (
    <nav aria-label="Sections" className="flex flex-wrap gap-2">
      {links.map((link) => {
        const isCurrent = link.href === current;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isCurrent ? "page" : undefined}
            className={
              isCurrent
                ? "rounded-lg bg-primary px-5 py-3 text-base font-medium text-surface"
                : "rounded-lg border border-ink/25 px-5 py-3 text-base font-medium text-ink hover:bg-ink/5"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
