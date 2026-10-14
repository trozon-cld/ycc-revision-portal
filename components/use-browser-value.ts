"use client";

import { useCallback, useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

// A value only the browser knows (the address, something this tab remembered). The server's HTML and the first
// browser render use `fallback`, so they match; React swaps in the real value straight after.
export function useBrowserValue<T extends string | boolean>(read: () => T, fallback: T): T {
  const snapshot = () => {
    try {
      return read();
    } catch {
      return fallback;
    }
  };
  return useSyncExternalStore(noSubscribe, snapshot, () => fallback);
}

// On/off choices remembered on this device (reader labels, page-turn animation). Read once, then kept in memory,
// so a switch still holds for this visit when storage is blocked (private windows).
const chosen = new Map<string, boolean>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function isOn(key: string): boolean {
  let known = chosen.get(key);
  if (known === undefined) {
    try {
      known = window.localStorage.getItem(key) !== "off";
    } catch {
      known = true;
    }
    chosen.set(key, known);
  }
  return known;
}

export function useDeviceSwitch(key: string): [on: boolean, toggle: () => void] {
  const on = useSyncExternalStore(subscribe, () => isOn(key), () => true);
  const toggle = useCallback(() => {
    const next = !isOn(key);
    chosen.set(key, next);
    try {
      window.localStorage.setItem(key, next ? "on" : "off");
    } catch {
      // Not remembered, but still switched for this visit.
    }
    listeners.forEach((listener) => listener());
  }, [key]);
  return [on, toggle];
}
