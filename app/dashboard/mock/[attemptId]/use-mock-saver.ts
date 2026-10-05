"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MockChange, MockSaveReply } from "@/lib/mock/types";
import { saveMockProgress } from "../actions";

export type SaveStatus = "saved" | "saving" | "retrying";

// Wait after a change before sending, so quick changes go together; and before retrying after a failure.
const SEND_AFTER_MS = 600;
const RETRY_AFTER_MS = 3000;

// Sends answer, flag and position changes to the server in batches, one request at a time (as Next does
// anyway), keeping only the newest change per question. Failed batches are kept and sent again.
export function useMockSaver(attemptId: string, onReply: (reply: MockSaveReply) => void) {
  const pending = useRef(new Map<number, MockChange>());
  const position = useRef<number | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settled = useRef<(() => void)[]>([]);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const replyRef = useRef(onReply);
  useEffect(() => {
    replyRef.current = onReply;
  });

  const idle = () => pending.current.size === 0 && position.current === null;

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (busy.current || idle()) {
      if (!busy.current) settled.current.splice(0).forEach((done) => done());
      return;
    }
    const changes = [...pending.current.values()];
    const onScreen = position.current;
    pending.current.clear();
    position.current = null;
    busy.current = true;
    setStatus("saving");
    let failed = false;
    try {
      replyRef.current(await saveMockProgress(attemptId, changes, onScreen));
    } catch {
      failed = true;
      // Put the batch back under anything newer that arrived meanwhile.
      for (const change of changes) pending.current.set(change.position, { ...change, ...pending.current.get(change.position) });
      if (position.current === null) position.current = onScreen;
    } finally {
      busy.current = false;
    }
    if (failed) {
      setStatus("retrying");
      timer.current = setTimeout(flush, RETRY_AFTER_MS);
    } else if (idle()) {
      setStatus("saved");
      settled.current.splice(0).forEach((done) => done());
    } else void flush();
  }, [attemptId]);

  const schedule = useCallback(() => {
    setStatus((current) => (current === "retrying" ? current : "saving"));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SEND_AFTER_MS);
  }, [flush]);

  const change = useCallback(
    (next: MockChange) => {
      pending.current.set(next.position, { ...pending.current.get(next.position), ...next });
      schedule();
    },
    [schedule]
  );

  const moveTo = useCallback(
    (onScreen: number) => {
      position.current = onScreen;
      schedule();
    },
    [schedule]
  );

  // Sends everything now and resolves once nothing is waiting (used when time is up).
  const flushAll = useCallback(
    () =>
      new Promise<void>((resolve) => {
        settled.current.push(resolve);
        void flush();
      }),
    [flush]
  );

  // Leaving the page or switching apps: send straight away.
  useEffect(() => {
    const now = () => void flush();
    const hidden = () => document.visibilityState === "hidden" && now();
    window.addEventListener("pagehide", now);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", now);
      document.removeEventListener("visibilitychange", hidden);
      now();
    };
  }, [flush]);

  return { status, change, moveTo, flushAll };
}
