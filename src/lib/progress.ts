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
  /** Characters the child has written stroke by stroke at least once. */
  charsWritten: string[];
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
  charsWritten: [],
};


function today() {
  return new Date().toISOString().slice(0, 10);
}

function read(): Progress {
  if (typeof localStorage === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    // A brand new reader gets a starter purse so they can make a first book.
    // Save it straight away, so the balance can never be re-derived differently
    // on a later visit.
    if (!raw) {
      const fresh = { ...EMPTY, coins: STARTER_COINS, earned: STARTER_COINS };
      try {
        localStorage.setItem(KEY, JSON.stringify(fresh));
      } catch {
        /* storage unavailable */
      }
      return fresh;
    }
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
  const activeDays = p.activeDays.includes(day)
    ? p.activeDays
    : [...p.activeDays, day].slice(-30);
  if (p.lastDay === day) return activeDays === p.activeDays ? p : { ...p, activeDays };
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = p.lastDay === yesterday ? p.streak + 1 : 1;
  const base = { ...p, lastDay: day, streak, activeDays };
  // Coming back on a new day pays a small bonus, but only once per day even if
  // several tabs or screens touch progress at the same moment.
  const key = `streak:${day}`;
  if (base.awarded[key]) return base;
  return {
    ...base,
    coins: base.coins + STREAK_BONUS,
    earned: base.earned + STREAK_BONUS,
    awarded: { ...base.awarded, [key]: true },
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

/** Tone bucket of a word: the tone of its first syllable ("0".."4"). */
function toneBucket(pinyin: string): string {
  const first = pinyin.trim().split(/[\s'·-]+/)[0] ?? "";
  return String(syllableTone(first));
}

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(EMPTY);
  // False until the device's saved purse/progress is in hand, so the UI can
  // stay quiet instead of flashing a placeholder balance.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProgress(read());
    setLoaded(true);
    const listener = (p: Progress) => setProgress(p);
    listeners.add(listener);
    // Another tab changing the purse must not leave this one showing a stale
    // balance that "changes" the next time the app is opened.
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY || e.key === null) setProgress(read());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
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

  /**
   * Record one practice event for a word: quiz answer or a tap in the reader.
   * Feeds words learned, tone practice, listening accuracy and review dates.
   */
  const recordAnswer = useCallback(
    (word: { hanzi: string; pinyin?: string }, kind: AnswerKind, correct: boolean) =>
      update((p) => {
        const day = today();
        const bucket = toneBucket(word.pinyin ?? "");
        const prevTone = p.toneStats[bucket] ?? { attempts: 0, correct: 0 };
        const entry = p.wordLog[word.hanzi] ?? { correctDays: [], lastSeen: day };
        const correctDays =
          correct && kind !== "read" && !entry.correctDays.includes(day)
            ? [...entry.correctDays, day].slice(-8)
            : entry.correctDays;

        let next: Progress = {
          ...p,
          toneStats: {
            ...p.toneStats,
            [bucket]: {
              // Reading a word aloud is exposure, not a graded attempt.
              attempts: prevTone.attempts + (kind === "read" ? 0 : 1),
              correct: prevTone.correct + (correct && kind !== "read" ? 1 : 0),
            },
          },
          wordLog: { ...p.wordLog, [word.hanzi]: { correctDays, lastSeen: day } },
          listenLog:
            kind === "listen" ? [...p.listenLog, correct ? 1 : 0].slice(-40) : p.listenLog,
        };

        if (correct && kind !== "read") {
          next = { ...next, wordsMastered: Array.from(new Set([...next.wordsMastered, word.hanzi])) };
        } else if (!correct) {
          next = {
            ...next,
            wordsMissed: { ...next.wordsMissed, [word.hanzi]: (next.wordsMissed[word.hanzi] ?? 0) + 1 },
          };
        }
        return next;
      }),
    [update],
  );

  const missWord = useCallback(
    (word: string) => recordAnswer({ hanzi: word }, "match", false),
    [recordAnswer],
  );

  const masterWord = useCallback(
    (word: string) => recordAnswer({ hanzi: word }, "match", true),
    [recordAnswer],
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

  /**
   * Remember a character the child wrote stroke by stroke. Coins are paid the
   * first time only, so repeating a character cannot farm the purse.
   */
  const writeChar = useCallback(
    (hanzi: string) =>
      update((p) => {
        const next: Progress = {
          ...p,
          charsWritten: Array.from(new Set([...p.charsWritten, hanzi])),
        };
        return give(next, REWARDS.character, `write:${hanzi}`);
      }),
    [update],
  );

  /** One-off bonus for finishing a whole writing round (page or chapter). */
  const finishWritingSet = useCallback(
    (key: string) => update((p) => give(p, REWARDS.writingSet, `writeset:${key}`)),
    [update],
  );



  return {
    progress,
    loaded,
    markRead,
    awardStars,
    seeWords,
    recordAnswer,
    missWord,
    masterWord,
    spend,
    buyItem,
    buyChapter,
    writeChar,
    finishWritingSet,

    saveCharacter,
  };
}

/** Learning summary derived from the stored counters, for the progress page. */
export type LearningStats = {
  learned: number;
  meeting: number;
  dueForReview: number;
  listenAccuracy: number | null;
  listenTrend: number;
  listenCount: number;
  activeLast7: number;
  tones: { tone: string; attempts: number; correct: number; rate: number | null }[];
};

const DAY = 86400000;

export function learningStats(p: Progress): LearningStats {
  const entries = Object.entries(p.wordLog);
  // Two correct answers on different days is our bar for "learned".
  const learnedWords = entries.filter(([, e]) => e.correctDays.length >= 2);
  const now = Date.now();
  const dueForReview = learnedWords.filter(
    ([, e]) => now - new Date(`${e.lastSeen}T00:00:00Z`).getTime() >= 5 * DAY,
  ).length;

  const log = p.listenLog;
  const recent = log.slice(-20);
  const older = log.slice(-40, -20);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const recentAvg = avg(recent);
  const olderAvg = avg(older);

  const week = new Set(
    Array.from({ length: 7 }, (_, i) => new Date(now - i * DAY).toISOString().slice(0, 10)),
  );

  return {
    learned: learnedWords.length,
    meeting: entries.length - learnedWords.length,
    dueForReview,
    listenAccuracy: recentAvg === null ? null : Math.round(recentAvg * 100),
    listenTrend:
      recentAvg === null || olderAvg === null ? 0 : Math.round((recentAvg - olderAvg) * 100),
    listenCount: recent.length,
    activeLast7: p.activeDays.filter((d) => week.has(d)).length,
    tones: ["1", "2", "3", "4", "0"].map((tone) => {
      const s = p.toneStats[tone] ?? { attempts: 0, correct: 0 };
      return {
        tone,
        attempts: s.attempts,
        correct: s.correct,
        rate: s.attempts ? Math.round((s.correct / s.attempts) * 100) : null,
      };
    }),
  };
}

/** Session-only test flag, mirrored here so owns()/isUnlocked() can see it. */
let testUnlockOn = false;

const TEST_COINS = 99999;

/**
 * Test switch: visiting any page with ?unlockAll=1 unlocks every outfit, hat,
 * pet and chapter for the rest of the browser session. It never touches the
 * saved purse, so the real coin balance stays exactly as the child earned it.
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
