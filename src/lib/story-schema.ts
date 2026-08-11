import { z } from "zod";
import { applySandhi, isToneMarked } from "./pinyin";
import type { Page, Word } from "./types";

/** Thrown when model output cannot be repaired into usable story content. */
export class StoryValidationError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(issues.length ? `${message} (${issues.join("; ")})` : message);
    this.name = "StoryValidationError";
    this.issues = issues;
  }
}

const nonEmpty = (max = 400) => z.string().trim().min(1).max(max);

/** Pinyin without tone marks teaches the wrong sounds, so it is rejected. */
const pinyin = (max: number) =>
  nonEmpty(max).refine(isToneMarked, { message: "pinyin must use tone marks" });

export const WordSchema = z
  .object({
    hanzi: nonEmpty(20),
    pinyin: pinyin(60),
    dict: nonEmpty(200),
    context: z.string().trim().max(200).optional(),
  })
  .transform((w) => ({ ...w, pinyin: applySandhi(w.hanzi, w.pinyin) }));

/** Only the characters that carry meaning, so punctuation never blocks a match. */
const hanziOnly = (s: string) => s.replace(/[^\p{Script=Han}\p{Script=Latin}\p{Nd}]/gu, "");

/**
 * True when the per-word list reconstructs the sentence. A mismatch means the
 * child would read different words than the narrator speaks.
 */
export function wordsMatchSentence(hanzi: string, words: { hanzi: string }[]) {
  if (words.length === 0) return false;
  return hanziOnly(words.map((w) => w.hanzi).join("")) === hanziOnly(hanzi);
}

export const SentenceSchema = z
  .object({
    hanzi: nonEmpty(200),
    pinyin: pinyin(400),
    native: nonEmpty(400),
    words: z.array(WordSchema).min(1),
  })
  .transform((s) => ({
    ...s,
    pinyin: applySandhi(s.hanzi, s.pinyin),
    // A word list that doesn't rebuild the line is dropped: the reader then
    // shows the whole sentence, which is exactly what is read aloud.
    words: wordsMatchSentence(s.hanzi, s.words) ? s.words : [],
  }));



export const PageSchema = z.object({
  sentences: z.array(SentenceSchema).min(1),
  /** English description of one scene to illustrate for this page. */
  scene: z.string().trim().max(600).optional(),
  /** Story characters visible on this page, matched to the book's bible. */
  cast: z.array(nonEmpty(120)).max(8).optional(),
  /** Where this page happens, matched to the book's bible. */
  place: z.string().trim().max(120).optional(),
  image_url: z.string().trim().max(500).nullable().optional(),
});

/** One character or place with a fixed look, written once per book. */
export const BibleEntrySchema = z.object({
  name: nonEmpty(120),
  description: nonEmpty(600),
});


export const ChapterContentSchema = z.object({
  pages: z.array(PageSchema).min(1),
  words: z.array(WordSchema).min(1),
});

export const OutlineChapterSchema = z.object({
  title: nonEmpty(120),
  /** Thai chapter title; children read this one first. */
  title_th: z.string().trim().max(160).optional(),
  summary: nonEmpty(1200),
  /** 3-5 short beats from the real story that this chapter must cover, in order. */
  keyEvents: z.array(nonEmpty(300)).max(12).default([]),
  illustration: z.string().trim().max(1200).optional(),
  mood: z.string().trim().max(40).optional(),
});

export const OutlineSchema = z.object({
  title: nonEmpty(160),
  title_th: z.string().trim().max(200).optional(),
  blurb: z.string().trim().max(600).optional(),
  blurb_th: z.string().trim().max(700).optional(),
  characters: z.array(nonEmpty(120)).max(20).default([]),
  chapters: z.array(OutlineChapterSchema).min(1),
});


export type ChapterContent = z.infer<typeof ChapterContentSchema>;
export type Outline = z.infer<typeof OutlineSchema>;

function asRecord(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new StoryValidationError("The story generator returned an unexpected shape.", [
      `expected object, got ${raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw}`,
    ]);
  }
  return raw as Record<string, unknown>;
}

function keepValid<T>(schema: z.ZodType<T>, list: unknown): T[] {
  if (!Array.isArray(list)) return [];
  const out: T[] = [];
  for (const item of list) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * Repair-then-validate model output for one chapter.
 * Individually broken words/sentences/pages are dropped; if nothing usable
 * survives, a StoryValidationError is thrown so the caller can retry.
 */
export function parseChapterContent(raw: unknown): { pages: Page[]; words: Word[] } {
  const obj = asRecord(raw);

  const rawPages = Array.isArray(obj.pages) ? obj.pages : [];
  const pages: Page[] = [];
  for (const p of rawPages) {
    if (p === null || typeof p !== "object" || Array.isArray(p)) continue;
    const sentencesRaw = (p as { sentences?: unknown }).sentences;
    const list = Array.isArray(sentencesRaw) ? sentencesRaw : [];
    const sentences = [];
    for (const s of list) {
      if (s === null || typeof s !== "object" || Array.isArray(s)) continue;
      // Repair the word list first so one bad word doesn't discard the sentence.
      const candidate = { ...(s as object), words: keepValid(WordSchema, (s as { words?: unknown }).words) };
      const parsed = SentenceSchema.safeParse(candidate);
      if (parsed.success) sentences.push(parsed.data);
    }
    const sceneRaw = (p as { scene?: unknown }).scene;
    const scene = typeof sceneRaw === "string" && sceneRaw.trim() ? sceneRaw.trim().slice(0, 600) : undefined;
    const castRaw = (p as { cast?: unknown }).cast;
    const cast = Array.isArray(castRaw)
      ? castRaw
          .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
          .map((c) => c.trim().slice(0, 120))
          .slice(0, 8)
      : [];
    const placeRaw = (p as { place?: unknown }).place;
    const place = typeof placeRaw === "string" && placeRaw.trim() ? placeRaw.trim().slice(0, 120) : undefined;
    if (sentences.length) pages.push({ sentences, scene, cast: cast.length ? cast : undefined, place });

  }


  const words = keepValid(WordSchema, obj.words);

  const result = ChapterContentSchema.safeParse({ pages, words });
  if (!result.success) {
    throw new StoryValidationError(
      "The story generator returned unusable chapter content.",
      result.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`),
    );
  }
  return { pages: result.data.pages, words: result.data.words };
}

/** Keep only usable bible entries; a malformed one is dropped, never fatal. */
export function parseBibleEntries(raw: unknown, max = 12): { name: string; description: string }[] {
  const seen = new Set<string>();
  const out: { name: string; description: string }[] = [];
  for (const entry of keepValid(BibleEntrySchema, raw)) {
    const key = entry.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
    if (out.length >= max) break;
  }
  return out;
}



/** Keep only usable short strings from a possibly-malformed list. */
function stringList(value: unknown, max = 300): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim().slice(0, max));
}

/** Repair-then-validate the book outline. */
export function parseOutline(raw: unknown, expectedCount?: number): Outline {
  const obj = asRecord(raw);
  // Repair each chapter's keyEvents first so one bad beat never drops a chapter.
  const rawChapters = Array.isArray(obj.chapters) ? obj.chapters : [];
  const cleaned = rawChapters.map((c) =>
    c && typeof c === "object" && !Array.isArray(c)
      ? { ...(c as object), keyEvents: stringList((c as { keyEvents?: unknown }).keyEvents) }
      : c,
  );
  const chapters = keepValid(OutlineChapterSchema, cleaned);

  const result = OutlineSchema.safeParse({
    title: obj.title,
    title_th: typeof obj.title_th === "string" ? obj.title_th : undefined,
    blurb: typeof obj.blurb === "string" ? obj.blurb : undefined,
    blurb_th: typeof obj.blurb_th === "string" ? obj.blurb_th : undefined,
    characters: stringList(obj.characters, 120),
    chapters,
  });

  if (!result.success) {
    throw new StoryValidationError(
      "The story generator returned an unusable outline.",
      result.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`),
    );
  }

  const outline = result.data;
  if (expectedCount && outline.chapters.length > expectedCount) {
    outline.chapters = outline.chapters.slice(0, expectedCount);
  }
  return outline;
}
