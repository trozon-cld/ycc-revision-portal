import Link from "next/link";

const LINKS = [
  { href: "/admin/admins", label: "Admins" },
  { href: "/admin/candidates", label: "Candidates" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/account", label: "My account" },
] as const;

export function SuperadminNav({
  current,
}: {
  current: (typeof LINKS)[number]["href"];
}) {
  return (
    <nav aria-label="Superadmin" className="flex flex-wrap gap-2">
      {LINKS.map((link) => {
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
