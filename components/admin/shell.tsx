"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { buttonClass } from "./styles";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { ToastProvider } from "./toast";
import { Icon, type IconName } from "@/components/icons";

type Role = "admin" | "superadmin";
type NavIconName = "admins" | "candidates" | "testTypes" | "handbook" | "questions" | "media" | "faq" | "languages" | "activity" | "account";
type NavItem = { href: string; label: string; icon: NavIconName };
type NavGroup = { heading?: string; items: NavItem[] };

// Shown to whoever CONTENT_EDITORS lists (lib/auth/content-editors.ts).
const CONTENT: NavGroup = {
  heading: "Content",
  items: [
    { href: "/admin/handbook", label: "Handbook", icon: "handbook" },
    { href: "/admin/questions", label: "Question bank", icon: "questions" },
    { href: "/admin/handbook/languages", label: "Languages", icon: "languages" },
    { href: "/admin/media", label: "Media", icon: "media" },
    { href: "/admin/faq", label: "General queries", icon: "faq" },
  ],
};
const contentFor = (role: Role): NavGroup[] => (CONTENT_EDITORS.includes(role) ? [CONTENT] : []);

const NAV: Record<Role, NavGroup[]> = {
  superadmin: [
    {
      heading: "Access",
      items: [
        { href: "/admin/admins", label: "Admins", icon: "admins" },
        { href: "/admin/candidates", label: "Candidates", icon: "candidates" },
        { href: "/admin/test-types", label: "Categories", icon: "testTypes" },
      ],
    },
    ...contentFor("superadmin"),
    {
      heading: "System",
      items: [
        { href: "/admin/activity", label: "Activity", icon: "activity" },
        { href: "/admin/account", label: "My account", icon: "account" },
      ],
    },
  ],
  // One group today; with content access, Content sits between Candidates and the rest, as for the Superadmin.
  admin: CONTENT_EDITORS.includes("admin")
    ? [
        { heading: "Access", items: [{ href: "/admin/candidates", label: "Candidates", icon: "candidates" }] },
        ...contentFor("admin"),
        {
          heading: "System",
          items: [
            { href: "/admin/activity", label: "My activity", icon: "activity" },
            { href: "/admin/account", label: "My account", icon: "account" },
          ],
        },
      ]
    : [
        {
          items: [
            { href: "/admin/candidates", label: "Candidates", icon: "candidates" },
            { href: "/admin/activity", label: "My activity", icon: "activity" },
            { href: "/admin/account", label: "My account", icon: "account" },
          ],
        },
      ],
};

// The link for this address: the longest one it falls under, so Languages (under /admin/handbook) lights alone.
function currentHref(groups: NavGroup[], pathname: string): string | undefined {
  return groups
    .flatMap((group) => group.items.map((item) => item.href))
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

const ROLE_LABEL: Record<Role, string> = { superadmin: "Superadmin", admin: "Admin" };

export function AdminShell({ role, email, name, children }: { role: Role; email: string; name: string | null; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <ToastProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-primary focus:shadow-lg focus:outline-2 focus:outline-primary"
      >
        Skip to main content
      </a>
      <div className="flex min-h-dvh flex-1 flex-col bg-slate-50 lg:flex-row">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <SidebarContent role={role} email={email} name={name} />
        </aside>

        <header className="sticky top-0 z-20 flex h-14 [@media(max-height:500px)]:static items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
          <Brand role={role} />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className={buttonClass("ghost", "icon")}
          >
            <Icon name="menu" size={20} weight="regular" />
          </button>
        </header>

        {menuOpen && (
          <MobileDrawer onClose={() => setMenuOpen(false)}>
            <SidebarContent role={role} email={email} name={name} onNavigate={() => setMenuOpen(false)} />
          </MobileDrawer>
        )}

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 2xl:max-w-[90rem] sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}

function Brand({ role }: { role: Role }) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-white">
        Y
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-ink">YCC Revision Portal</p>
        <p className="text-xs text-slate-600">{ROLE_LABEL[role]} console</p>
      </div>
    </div>
  );
}

function SidebarContent({ role, email, name, onNavigate }: { role: Role; email: string; name: string | null; onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = currentHref(NAV[role], pathname);

  return (
    <>
      <div className="flex h-14 items-center border-b border-slate-200 px-4 lg:h-16">
        <Brand role={role} />
      </div>
      <nav aria-label="Admin sections" className="flex-1 space-y-4 overflow-y-auto p-3">
        {NAV[role].map((group, groupIndex) => (
          <div
            key={group.heading ?? `group-${groupIndex}`}
            role={group.heading ? "group" : undefined}
            aria-label={group.heading}
            className="space-y-0.5"
          >
            {group.heading && (
              <p aria-hidden="true" className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-slate-600">{group.heading}</p>
            )}
            {group.items.map((item) => {
              const isCurrent = current === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`flex h-10 items-center gap-2.5 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:h-9 ${
                    isCurrent ? "hc-edge bg-primary/10 font-medium text-primary" : "text-slate-700 hover:bg-slate-100 hover:text-ink"
                  }`}
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <p className="truncate px-1 text-sm font-medium text-ink" title={email}>
          {email}
        </p>
        {/* The header already names the console, so the name takes the role's place once set. */}
        <p className="truncate px-1 text-xs text-slate-600" title={name ?? undefined}>
          {name ?? ROLE_LABEL[role]}
        </p>
        <LogoutButton className={`${buttonClass("secondary", "sm")} mt-2 w-full`} />
      </div>
    </>
  );
}

function MobileDrawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label="Menu"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="admin-drawer my-0 ml-0 mr-auto h-dvh max-h-dvh w-72 max-w-[85vw] bg-white p-0 shadow-xl backdrop:bg-ink/40"
    >
      <div className="relative flex h-full flex-col">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className={`${buttonClass("ghost", "icon")} absolute right-2 top-2`}
        >
          <Icon name="close" size={20} weight="regular" />
        </button>
        {children}
      </div>
    </dialog>
  );
}

// Staff nav names mapped onto the shared icon set.
const NAV_ICONS: Record<NavIconName, IconName> = {
  admins: "admins",
  candidates: "candidates",
  testTypes: "testTypes",
  handbook: "book",
  questions: "help",
  media: "picture",
  faq: "faq",
  languages: "listen",
  activity: "activity",
  account: "account",
};

function NavIcon({ name }: { name: NavIconName }) {
  return <Icon name={NAV_ICONS[name]} size={16} weight="regular" />;
}
