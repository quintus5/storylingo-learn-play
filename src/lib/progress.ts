import { useCallback, useEffect, useState } from "react";
import type { CharacterLook } from "./character";
import { PRICES, REWARDS, STARTER_COINS, STREAK_BONUS } from "./economy";
import { syllableTone } from "./pinyin";

const KEY = "storylingo.progress.v2";
const LEGACY_KEY = "storylingo.progress.v1";

export type BookProgress = {
  /** chapter idx -> stars earned (1-3) */
  stars: Record<number, number>;
  /** chapter idx -> true once the reader reached the last page */
  read: Record<number, boolean>;
};

/** Practice counters for one tone bucket (0 = neutral, 1-4 = tones). */
export type ToneStat = { attempts: number; correct: number };

/** What we remember about a single word's practice history. */
export type WordLogEntry = {
  /** ISO days on which the word was answered correctly (deduped, max 8). */
  correctDays: string[];
  /** Last ISO day the word was seen at all. */
  lastSeen: string;
};

export type AnswerKind = "match" | "listen" | "translate" | "read";

export type Progress = {
  books: Record<string, BookProgress>;
  wordsSeen: string[];
  wordsMissed: Record<string, number>;
  wordsMastered: string[];
  lastDay: string | null;
  streak: number;
  /** Coins in the purse right now. */
  coins: number;
  /** Every coin ever earned, for the parent progress page. */
  earned: number;
  /** Shop item ids the child owns. */
  owned: string[];
  /** One-off reward keys already paid out, so nothing can be farmed twice. */
  awarded: Record<string, boolean>;
  /** "bookId:chapterIdx" keys unlocked with coins instead of stars. */
  bought: Record<string, boolean>;
  character: CharacterLook | null;
  /** Tone bucket ("0".."4") -> practice counters. */
  toneStats: Record<string, ToneStat>;
  /** Recent listening-round results, newest last, capped at 40. */
  listenLog: number[];
  /** hanzi -> practice history, for "words learned" and review reminders. */
  wordLog: Record<string, WordLogEntry>;
  /** ISO days the child practised, newest last, capped at 30. */
  activeDays: string[];
};

const EMPTY: Progress = {
  books: {},
  wordsSeen: [],
  wordsMissed: {},
  wordsMastered: [],
  lastDay: null,
  streak: 0,
  // Same value a brand new reader really starts with, so the number shown
  // before storage loads matches the number shown after.
  coins: STARTER_COINS,
  earned: 0,
  owned: [],
  awarded: {},
  bought: {},
  character: null,
  toneStats: {},
  listenLog: [],
  wordLog: {},
  activeDays: [],
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function read(): Progress {
  if (typeof localStorage === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    // A brand new reader gets a starter purse so they can make a first book.
    if (!raw) return { ...EMPTY, coins: STARTER_COINS, earned: STARTER_COINS };
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
  const streak = p.lastDay === yesterday ? p.streak + 1 : 1;
  // Coming back on a new day always pays a small bonus.
  return {
    ...p,
    lastDay: day,
    streak,
    coins: p.coins + STREAK_BONUS,
    earned: p.earned + STREAK_BONUS,
  };
}

/** Add coins. When `key` is given the reward is paid only once, ever. */
function give(p: Progress, amount: number, key?: string): Progress {
  if (amount <= 0) return p;
  if (key && p.awarded[key]) return p;
  return {
    ...p,
    coins: p.coins + amount,
    earned: p.earned + amount,
    awarded: key ? { ...p.awarded, [key]: true } : p.awarded,
  };
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
        const next = {
          ...p,
          books: { ...p.books, [bookId]: { ...book, read: { ...book.read, [idx]: true } } },
        };
        return give(next, REWARDS.chapterRead, `read:${bookId}:${idx}`);
      }),
    [update],
  );

  const awardStars = useCallback(
    (bookId: string, idx: number, stars: number) =>
      update((p) => {
        const book = p.books[bookId] ?? { stars: {}, read: {} };
        const had = book.stars[idx] ?? 0;
        const best = Math.max(had, stars);
        let next: Progress = {
          ...p,
          books: { ...p.books, [bookId]: { ...book, stars: { ...book.stars, [idx]: best } } },
        };
        // Only new stars pay out, so replaying a quiz cannot farm coins.
        next = give(next, Math.max(0, best - had) * REWARDS.star);
        if (stars >= 3) next = give(next, REWARDS.perfectQuiz, `perfect:${bookId}:${idx}`);
        return next;
      }),
    [update],
  );

  const seeWords = useCallback(
    (words: string[]) =>
      update((p) => {
        const fresh = words.filter((w) => w && !p.wordsSeen.includes(w));
        const next = { ...p, wordsSeen: Array.from(new Set([...p.wordsSeen, ...words])) };
        return give(next, fresh.length * REWARDS.newWord);
      }),
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
    (word: string) => update((p) => ({ ...p, wordsMastered: Array.from(new Set([...p.wordsMastered, word])) })),
    [update],
  );

  /** Spend coins. Returns false (and changes nothing) when the purse is short. */
  const spend = useCallback(
    (amount: number, apply?: (p: Progress) => Progress) => {
      const current = read();
      if (current.coins < amount) return false;
      update((p) => {
        if (p.coins < amount) return p;
        const paid = { ...p, coins: p.coins - amount };
        return apply ? apply(paid) : paid;
      });
      return true;
    },
    [update],
  );

  const buyItem = useCallback(
    (itemId: string, price: number) =>
      spend(price, (p) => ({ ...p, owned: Array.from(new Set([...p.owned, itemId])) })),
    [spend],
  );

  const buyChapter = useCallback(
    (bookId: string, idx: number) =>
      spend(PRICES.chapter, (p) => ({
        ...p,
        bought: { ...p.bought, [`${bookId}:${idx}`]: true },
      })),
    [spend],
  );

  const saveCharacter = useCallback((character: CharacterLook) => update((p) => ({ ...p, character })), [update]);

  return {
    progress,
    markRead,
    awardStars,
    seeWords,
    missWord,
    masterWord,
    spend,
    buyItem,
    buyChapter,
    saveCharacter,
  };
}

/** Session-only test flag, mirrored here so owns()/isUnlocked() can see it. */
let testUnlockOn = false;

const TEST_COINS = 99999;

/**
 * Test switch: visiting any page with ?unlockAll=1 unlocks every outfit, hat,
 * pet and chapter for the rest of the browser session and tops the purse up to
 * 99,999 coins once. Only the coin top-up is saved; ownership stays untouched.
 * Read after hydration so the server and the first client render agree.
 */
export function useTestUnlock() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("unlockAll") === "1") {
        sessionStorage.setItem("storylingo.unlockAll", "1");
      }
      const active = sessionStorage.getItem("storylingo.unlockAll") === "1";
      testUnlockOn = active;
      setOn(active);
      // Top the purse up once per session so purchases are testable end to end.
      if (active && sessionStorage.getItem("storylingo.unlockAll.paid") !== "1") {
        sessionStorage.setItem("storylingo.unlockAll.paid", "1");
        const p = read();
        if (p.coins < TEST_COINS) write({ ...p, coins: TEST_COINS, earned: Math.max(p.earned, TEST_COINS) });
      }
    } catch {
      setOn(false);
    }
  }, []);
  return on;
}

export function owns(p: Progress, itemId: string) {
  return testUnlockOn || p.owned.includes(itemId);
}

export function isUnlocked(p: Progress, bookId: string, idx: number) {
  if (testUnlockOn) return true;
  if (idx <= 1) return true;
  if (p.bought[`${bookId}:${idx}`]) return true;
  return (p.books[bookId]?.stars[idx - 1] ?? 0) > 0;
}
