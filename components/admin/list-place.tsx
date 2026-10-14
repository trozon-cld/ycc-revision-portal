"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { useBrowserValue } from "@/components/use-browser-value";

// Lists remember their filters and page for this tab, so "back" links return to the same place.
const storageKeyFor = (list: string) => `ycc-list:${list}`;
const MAX_SEARCH_LENGTH = 1000;

export function RememberListPlace({ list, search }: { list: string; search: string }) {
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKeyFor(list), search);
    } catch {}
  }, [list, search]);
  return null;
}

export function ListBackLink({ list, href, className, children }: { list: string; href: string; className?: string; children: ReactNode }) {
  const target = useBrowserValue(() => {
    const search = sessionStorage.getItem(storageKeyFor(list)) ?? "";
    return search.startsWith("?") && search.length <= MAX_SEARCH_LENGTH ? href + search : href;
  }, href);
  return (
    <Link href={target} className={className}>
      {children}
    </Link>
  );
}
