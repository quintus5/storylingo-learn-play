/** Pure helpers for judging fetched source text. Safe to import anywhere. */

/** Count characters that indicate a broken decode or binary payload. */
export function junkRatio(text: string): number {
  if (!text.length) return 1;
  const junk = (text.match(/[\p{C}\uFFFD]/gu) ?? []).length;
  return junk / text.length;
}

/**
 * Reject text that is mostly binary junk rather than real prose.
 * Any Unicode letter, mark, number, whitespace, punctuation or symbol counts as
 * readable — this keeps CJK fullwidth punctuation (：，。？“”·) from being penalised.
 */
export function assertReadable(text: string): void {
  if (text.length < 200) {
    throw new Error("That page didn't contain enough story text to work with.");
  }
  if (junkRatio(text) > 0.05) {
    throw new Error(
      "That link didn't give back readable text — it looks like a file StoryLingo can't read.",
    );
  }
}

/** Rough "word" count that also works for Chinese/Japanese text with no spaces. */
export function estimateWordCount(text: string): number {
  const han = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
  if (han / Math.max(text.length, 1) > 0.2) return Math.round(han / 1.7);
  return text.split(/\s+/).filter(Boolean).length;
}
