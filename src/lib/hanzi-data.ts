/**
 * Stroke data for the "Write it" practice card.
 *
 * hanzi-writer fetches character data from a CDN by default. We wrap that in
 * our own loader so we can cache in memory, remember which characters have no
 * data at all, and fail quietly (the write option simply disappears) instead
 * of leaving a broken empty box on screen.
 */

const CDN = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1";
const MIRROR = "https://unpkg.com/hanzi-writer-data@2.0.1";

/** Loaded character data, kept for the whole session. */
const cache = new Map<string, unknown>();
/** Characters we already know have no stroke data (or failed to load). */
const missing = new Set<string>();
const inflight = new Map<string, Promise<unknown | null>>();

/** True for a single CJK character we could plausibly have stroke data for. */
export function isHanzi(ch: string) {
  return /^[\u3400-\u4dbf\u4e00-\u9fff]$/.test(ch);
}

async function fetchFrom(base: string, char: string) {
  const res = await fetch(`${base}/${encodeURIComponent(char)}.json`);
  if (!res.ok) return null;
  return (await res.json()) as unknown;
}

/** Character data, or null when this character cannot be practised. */
export async function loadCharData(char: string): Promise<unknown | null> {
  if (cache.has(char)) return cache.get(char) ?? null;
  if (missing.has(char) || !isHanzi(char)) return null;

  const existing = inflight.get(char);
  if (existing) return existing;

  const job = (async () => {
    for (const base of [CDN, MIRROR]) {
      try {
        const data = await fetchFrom(base, char);
        if (data) {
          cache.set(char, data);
          return data;
        }
      } catch {
        /* try the next source */
      }
    }
    missing.add(char);
    return null;
  })().finally(() => inflight.delete(char));

  inflight.set(char, job);
  return job;
}

/** Loader in the shape hanzi-writer expects. */
export function charDataLoader(
  char: string,
  onComplete: (data: unknown) => void,
  onError: () => void,
) {
  void loadCharData(char).then((data) => (data ? onComplete(data) : onError()));
}

/** Warm the cache so a card opens without a spinner. */
export function preloadChars(chars: string[]) {
  chars.slice(0, 12).forEach((c) => void loadCharData(c));
}

/** Unique practisable characters inside some words, in reading order. */
export function writableChars(words: { hanzi: string }[]): string[] {
  const out: string[] = [];
  for (const w of words) {
    for (const ch of Array.from(w.hanzi)) {
      if (isHanzi(ch) && !out.includes(ch)) out.push(ch);
    }
  }
  return out;
}

/** Filters a list down to the characters that really do have stroke data. */
export async function keepWritable(chars: string[]): Promise<string[]> {
  const checks = await Promise.all(chars.map((c) => loadCharData(c)));
  return chars.filter((_, i) => checks[i] !== null);
}
