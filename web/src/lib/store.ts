"use client";

import { useSyncExternalStore } from "react";

// localStorage as an external store: the static HTML renders with server defaults,
// then React switches to the stored value without an effect-driven re-render.

const EVENT = "yaqin:store";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function writeStored(key: string, value: string | null) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
  window.dispatchEvent(new Event(EVENT));
}

export function readStored(key: string): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(key);
}

/** Raw stored string (stable between renders, so safe as a snapshot). */
export function useStored(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key),
    () => null,
  );
}

const noop = () => () => {};

/** True only after hydration, for values that exist solely in the browser. */
export function useIsClient(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function useBrowserValue<T>(get: () => T, serverValue: T): T {
  return useSyncExternalStore(noop, get, () => serverValue);
}
