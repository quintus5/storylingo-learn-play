import { z } from "zod";
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

export const WordSchema = z.object({
  hanzi: nonEmpty(20),
  pinyin: nonEmpty(60),
  dict: nonEmpty(200),
  context: z.string().trim().max(200).optional(),
});

export const SentenceSchema = z.object({
  hanzi: nonEmpty(200),
  pinyin: nonEmpty(400),
  native: nonEmpty(400),
  words: z.array(WordSchema).min(1),
});

export const PageSchema = z.object({
  sentences: z.array(SentenceSchema).min(1),
  /** English description of one scene to illustrate for this page. */
  scene: z.string().trim().max(600).optional(),
  image_url: z.string().trim().max(500).nullable().optional(),
});

export const ChapterContentSchema = z.object({
  pages: z.array(PageSchema).min(1),
  words: z.array(WordSchema).min(1),
});

export const OutlineChapterSchema = z.object({
  title: nonEmpty(120),
  summary: nonEmpty(1200),
  /** 3-5 short beats from the real story that this chapter must cover, in order. */
  keyEvents: z.array(nonEmpty(300)).max(12).default([]),
  illustration: z.string().trim().max(1200).optional(),
  mood: z.string().trim().max(40).optional(),
});

export const OutlineSchema = z.object({
  title: nonEmpty(160),
  blurb: z.string().trim().max(600).optional(),
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
    if (sentences.length) pages.push({ sentences, scene });
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
    blurb: typeof obj.blurb === "string" ? obj.blurb : undefined,
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
