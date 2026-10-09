"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./toast";

// Shows a toast after a server redirect (e.g. "?done=deleted"), then drops that parameter from the address.
export function FlashToast({ message, param = "done" }: { message: string; param?: string }) {
  const toast = useToast();
  const router = useRouter();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast(message);
    const url = new URL(window.location.href);
    url.searchParams.delete(param);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [message, param, router, toast]);

  return null;
}
