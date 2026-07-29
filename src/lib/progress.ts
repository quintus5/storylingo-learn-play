import { useCallback, useEffect, useState } from "react";

const KEY = "storylingo.progress.v1";

export type BookProgress = {
  /** chapter idx -> stars earned (1-3) */
  stars: Record<number, number>;
  /** chapter idx -> true once the reader reached the last page */
  read: Record<number, boolean>;
};

export type Progress = {
  books: Record<string, BookProgress>;
  wordsSeen: string[];
  wordsMissed: Record<string, number>;
  wordsMastered: string[];
  lastDay: string | null;
  streak: number;
};

const EMPTY: Progress = {
  books: {},
  wordsSeen: [],
  wordsMissed: {},
  wordsMastered: [],
  lastDay: null,
  streak: 0,
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function read(): Progress {
  if (typeof localStorage === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Progress) };
  } catch {
    return EMPTY;
  }
}

function write(next: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or unavailable */
  }
  listeners.forEach((l) => l(next));
}

const listeners = new Set<(p: Progress) => void>();

function touchStreak(p: Progress): Progress {
  const day = today();
  if (p.lastDay === day) return p;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return { ...p, lastDay: day, streak: p.lastDay === yesterday ? p.streak + 1 : 1 };
}

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(EMPTY);

  useEffect(() => {
    setProgress(read());
    const listener = (p: Progress) => setProgress(p);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const update = useCallback((fn: (p: Progress) => Progress) => {
    write(touchStreak(fn(read())));
  }, []);

  const markRead = useCallback(
    (bookId: string, idx: number) =>
      update((p) => {
        const book = p.books[bookId] ?? { stars: {}, read: {} };
        return {
          ...p,
          books: { ...p.books, [bookId]: { ...book, read: { ...book.read, [idx]: true } } },
        };
      }),
    [update],
  );

  const awardStars = useCallback(
    (bookId: string, idx: number, stars: number) =>
      update((p) => {
        const book = p.books[bookId] ?? { stars: {}, read: {} };
        const best = Math.max(book.stars[idx] ?? 0, stars);
        return {
          ...p,
          books: { ...p.books, [bookId]: { ...book, stars: { ...book.stars, [idx]: best } } },
        };
      }),
    [update],
  );

  const seeWords = useCallback(
    (words: string[]) =>
      update((p) => ({ ...p, wordsSeen: Array.from(new Set([...p.wordsSeen, ...words])) })),
    [update],
  );

  const missWord = useCallback(
    (word: string) =>
      update((p) => ({
        ...p,
        wordsMissed: { ...p.wordsMissed, [word]: (p.wordsMissed[word] ?? 0) + 1 },
      })),
    [update],
  );

  const masterWord = useCallback(
    (word: string) =>
      update((p) => ({ ...p, wordsMastered: Array.from(new Set([...p.wordsMastered, word])) })),
    [update],
  );

  return { progress, markRead, awardStars, seeWords, missWord, masterWord };
}

export function isUnlocked(p: Progress, bookId: string, idx: number) {
  if (idx <= 1) return true;
  return (p.books[bookId]?.stars[idx - 1] ?? 0) > 0;
}
