import { useEffect, useState } from "react";
import { ALL_ART } from "@/lib/character-art";

/**
 * Persistent sprite storage.
 *
 * Sprite layers are stored in the Cache Storage API so they survive reloads and
 * tab closes. On later visits the bytes come straight off disk with no network
 * round-trip and no re-warming, and every layer is handed to the DOM as a blob
 * URL that paints synchronously.
 */
const CACHE_NAME = "storylingo-sprites-v2";

const objectUrls = new Map<string, string>();
const listeners = new Set<() => void>();
let priming: Promise<void> | null = null;

function notify() {
  for (const fn of listeners) fn();
}

/** Resolve a bundled sprite path to its cached blob URL when we have one. */
export function spriteUrl(src: string): string {
  return objectUrls.get(src) ?? src;
}

async function cacheOne(cache: Cache, src: string) {
  if (objectUrls.has(src)) return;
  let res = await cache.match(src);
  if (!res) {
    const fetched = await fetch(src, { cache: "force-cache" });
    if (!fetched.ok) return;
    await cache.put(src, fetched.clone());
    res = fetched;
  }
  const blob = await res.blob();
  objectUrls.set(src, URL.createObjectURL(blob));
}

/** Store every sprite layer on disk once; later visits reuse it instantly. */
export function primeSpriteCache(): Promise<void> {
  if (priming) return priming;
  if (typeof window === "undefined" || !("caches" in window)) {
    priming = Promise.resolve();
    return priming;
  }

  priming = (async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("storylingo-sprites-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k)),
      );

      const cache = await caches.open(CACHE_NAME);
      await Promise.all(ALL_ART.map((src) => cacheOne(cache, src).catch(() => undefined)));
      notify();
    } catch {
      /* private mode or quota: fall back to plain <img> loading */
    }
  })();

  return priming;
}

/**
 * Subscribe to the cached sprite URLs. Returns a resolver that swaps bundled
 * paths for persistent blob URLs as soon as they are ready.
 */
export function useSpriteUrl(): (src: string) => string {
  const [, bump] = useState(0);

  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    void primeSpriteCache();
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return spriteUrl;
}
