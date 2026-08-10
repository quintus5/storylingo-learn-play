/**
 * Play-money economy. Coins are earned by reading and playing, and spent on
 * new chapters, new books and dress-up items. Everything lives on the device.
 */

/** Coins every new reader starts with, enough for a first book. */
export const STARTER_COINS = 150;

export const PRICES = {
  /** Unlock the next chapter without three stars. */
  chapter: 60,
  /** Make a brand new book. */
  book: 150,
  outfit: 40,
  hat: 30,
  pet: 80,
  voice: 100,
} as const;

export const REWARDS = {
  /** Per star earned in a chapter quiz. */
  star: 20,
  /** First time a chapter is read to the last page. */
  chapterRead: 25,
  /** Every new word tapped open for the first time. */
  newWord: 2,
  /** A perfect quiz round. */
  perfectQuiz: 30,
  /** First time a character is written all the way through. */
  character: 8,
  /** Finishing every character in one writing round. */
  writingSet: 20,
} as const;


/** Coins for keeping a daily reading streak alive. */
export const STREAK_BONUS = 10;

export function formatCoins(n: number) {
  return n.toLocaleString();
}
