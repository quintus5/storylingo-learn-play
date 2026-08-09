import { useSyncExternalStore } from "react";

/**
 * Hidden developer mode. Toggled by double-clicking the moon in the header.
 * Session-only: it lives in memory so a reload always returns to normal mode.
 */
let devMode = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function toggleDevMode() {
  devMode = !devMode;
  emit();
  return devMode;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useDevMode() {
  return useSyncExternalStore(
    subscribe,
    () => devMode,
    () => false,
  );
}
