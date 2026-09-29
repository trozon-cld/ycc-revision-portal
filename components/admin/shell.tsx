"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { buttonClass } from "./styles";
import { ToastProvider } from "./toast";

type Role = "admin" | "superadmin";
type IconName = "admins" | "candidates" | "categories" | "handbook" | "questions" | "media" | "activity" | "account";
type NavItem = { href: string; label: string; icon: IconName };
type NavGroup = { heading?: string; items: NavItem[] };

const NAV: Record<Role, NavGroup[]> = {
  superadmin: [
    {
      items: [
        { href: "/admin/admins", label: "Admins", icon: "admins" },
        { href: "/admin/candidates", label: "Candidates", icon: "candidates" },
        { href: "/admin/categories", label: "Categories", icon: "categories" },
      ],
    },
    {
      heading: "Content",
      items: [
        { href: "/admin/handbook", label: "Handbook", icon: "handbook" },
        { href: "/admin/questions", label: "Question bank", icon: "questions" },
        { href: "/admin/media", label: "Media", icon: "media" },
      ],
    },
    {
      items: [
        { href: "/admin/activity", label: "Activity", icon: "activity" },
        { href: "/admin/account", label: "My account", icon: "account" },
      ],
    },
  ],
  admin: [
    {
      items: [
        { href: "/admin/candidates", label: "Candidates", icon: "candidates" },
        { href: "/admin/activity", label: "My activity", icon: "activity" },
        { href: "/admin/account", label: "My account", icon: "account" },
      ],
    },
  ],
};

const ROLE_LABEL: Record<Role, string> = { superadmin: "Superadmin", admin: "Admin" };

export function AdminShell({ role, email, name, children }: { role: Role; email: string; name: string | null; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-1 flex-col bg-slate-50 lg:flex-row">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <SidebarContent role={role} email={email} name={name} />
        </aside>

        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
          <Brand role={role} />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className={buttonClass("ghost", "icon")}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {menuOpen && (
          <MobileDrawer onClose={() => setMenuOpen(false)}>
            <SidebarContent role={role} email={email} name={name} onNavigate={() => setMenuOpen(false)} />
          </MobileDrawer>
        )}

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
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
              const isCurrent = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`flex h-10 items-center gap-2.5 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:h-9 ${
                    isCurrent ? "bg-primary/10 font-medium text-primary" : "text-slate-700 hover:bg-slate-100 hover:text-ink"
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
          <svg viewBox="0 0 20 20" aria-hidden="true" className="size-5">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
        {children}
      </div>
    </dialog>
  );
}

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    admins: (
      <>
        <circle cx="7.5" cy="7" r="2.75" />
        <path d="M2.5 16c.6-2.6 2.5-4 5-4s4.4 1.4 5 4" />
        <path d="M13 4.5a2.5 2.5 0 010 5M14.5 12.2c1.5.5 2.5 1.8 3 3.8" />
      </>
    ),
    candidates: (
      <>
        <circle cx="10" cy="7" r="3" />
        <path d="M4 17c.7-3 3-4.5 6-4.5s5.3 1.5 6 4.5" />
      </>
    ),
    categories: (
      <>
        <path d="M3.5 3.5h6l7 7-6 6-7-7z" />
        <circle cx="7" cy="7" r="1" />
      </>
    ),
    handbook: (
      <>
        <path d="M10 5.5C8.5 4.3 6.3 3.75 3 3.75v11.5c3.3 0 5.5.55 7 1.75 1.5-1.2 3.7-1.75 7-1.75V3.75c-3.3 0-5.5.55-7 1.75z" />
        <path d="M10 5.5V17" />
      </>
    ),
    questions: (
      <>
        <circle cx="10" cy="10" r="7" />
        <path d="M7.75 8a2.25 2.25 0 114 1.4c-.8.6-1.75 1.1-1.75 2.1" />
        <path d="M10 14.25v.01" />
      </>
    ),
    media: (
      <>
        <rect x="3" y="4" width="14" height="12" rx="1.5" />
        <circle cx="7.5" cy="8.5" r="1.25" />
        <path d="M3.5 14.5l4-4 3 3 2-2 4 4" />
      </>
    ),
    activity: (
      <>
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6v4l2.5 2" />
      </>
    ),
    account: (
      <>
        <circle cx="10" cy="10" r="2.5" />
        <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
