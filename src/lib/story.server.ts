import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatJson, generateIllustration } from "./ai.server";
import { toWebp } from "./image-optimize.server";
import { ART_STYLE_MENU, DEFAULT_ART_STYLE, artStylePrompt, isArtStyleId } from "./art-styles";
import type { ArtStyleId } from "./art-styles";
import type { BibleEntry, Page, Word } from "./types";
import { StoryValidationError, parseBibleEntries, parseChapterContent, parseOutline } from "./story-schema";

import type { Outline } from "./story-schema";

const BUCKET = "story-art";

export type { Outline };

export {
  assertReadable,
  assertProse,
  contentFragment,
  estimateWordCount,
  junkRatio,
  looksLikeNavigation,
  proseSignals,
  sliceHtmlAtFragment,
  stripGutenbergBoilerplate,
} from "./readable";
import {
  assertReadable,
  contentFragment,
  estimateWordCount,
  sliceHtmlAtFragment,
  stripGutenbergBoilerplate,
} from "./readable";

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(doc, { mergePages: true });
  const clean = (Array.isArray(text) ? text.join("\n") : text).replace(/\s+/g, " ").trim();
  if (clean.length < 200) {
    throw new Error("That PDF has no readable text — it looks like scanned images.");
  }
  return clean;
}

function extractHtmlText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    // Blocks end in line breaks so that menu items, captions and paragraphs
    // stay apart. That structure is what lets the prose check tell a page of
    // links from a story, and it is lost the moment everything is one line.
    .replace(/<\/(?:p|div|li|tr|h[1-6]|blockquote|section|article|figcaption|td|th)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[^\S\n]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const BLOCKED_HOST =
  /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?f[cd])/i;

/** Bare IP literals are never a legitimate story link, and hide rebinding tricks. */
const IP_LITERAL = /^(\d{1,3}\.){3}\d{1,3}$|^\[?[0-9a-f:]+\]?$/i;

/** Only allow public http(s) links — never internal/metadata addresses. */
function assertSafeUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That doesn't look like a valid link.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https links are supported.");
  }
  if (
    BLOCKED_HOST.test(parsed.hostname) ||
    IP_LITERAL.test(parsed.hostname) ||
    !parsed.hostname.includes(".")
  ) {
    throw new Error("That link points to a private address StoryLingo can't read.");
  }
  return parsed;
}

const MAX_REDIRECTS = 3;

/**
 * Fetch following redirects by hand, re-checking every hop. Letting fetch
 * follow redirects would allow a public link to bounce us at an internal
 * address, which is the classic SSRF hole.
 */
async function safeFetch(url: string): Promise<Response> {
  let target = assertSafeUrl(url).toString();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(target, {
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StoryLingoBot/1.0)" },
    });
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    // Re-validate the new destination before following it.
    target = assertSafeUrl(new URL(location, target).toString()).toString();
  }
  throw new Error("That link redirects too many times.");
}

/** As much source text as one book is ever planned from. */
const MAX_SOURCE_CHARS = 24000;

/** An anchored section this small is a stub, so the whole page is better. */
const MIN_SECTION_CHARS = 200;

export type SourceText = {
  /** The text handed to the models, already cut to the budget. */
  text: string;
  /** How much readable text the source really held, before cutting. */
  sourceChars: number;
  /** True when the source was longer than the budget, so the tail is missing. */
  truncated: boolean;
  /**
   * Only set when the link carried a fragment: whether that anchor was found.
   * False means the reader is looking at the whole document, not the chapter
   * they asked for.
   */
  fragmentResolved?: boolean;
};

/** Fetch a web page or PDF and reduce it to readable plain text. */
export async function fetchStoryDocument(url: string): Promise<SourceText> {
  const res = await safeFetch(url);
  if (!res.ok) throw new Error(`Could not read that page (status ${res.status}).`);

  const declaredSize = Number(res.headers.get("content-length") ?? 0);
  if (declaredSize > 20_000_000) throw new Error("That file is too large to read.");



  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const looksPdf = contentType.includes("pdf") || /\.pdf(\?|#|$)/i.test(url);

  // HTTP never sends the fragment, so a chapter link would otherwise fetch the
  // whole book and the first 24k characters would be its front matter.
  const fragment = contentFragment(url);
  let fragmentResolved = fragment ? false : undefined;

  let text: string;
  if (looksPdf) {
    text = await extractPdfText(await res.arrayBuffer());
  } else if (contentType.includes("html") || contentType.includes("xml") || !contentType) {
    const html = await res.text();
    const section = fragment ? sliceHtmlAtFragment(html, fragment) : null;
    const sectionText = section ? extractHtmlText(section) : "";
    if (sectionText.length >= MIN_SECTION_CHARS) {
      text = sectionText;
      fragmentResolved = true;
    } else {
      text = extractHtmlText(html);
    }
  } else if (contentType.startsWith("text/")) {
    text = (await res.text()).replace(/[^\S\n]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  } else {
    throw new Error("That link isn't a readable story page or PDF.");
  }

  text = stripGutenbergBoilerplate(text);
  assertReadable(text);
  return {
    text: text.slice(0, MAX_SOURCE_CHARS),
    sourceChars: text.length,
    truncated: text.length > MAX_SOURCE_CHARS,
    fragmentResolved,
  };
}

/** Fetch a source link and keep only its story text. */
export async function fetchStoryText(url: string): Promise<string> {
  return (await fetchStoryDocument(url)).text;
}



/** Cache source text per URL for the lifetime of the worker instance. */
const sourceCache = new Map<string, SourceText>();

export async function getSourceDocument(url: string): Promise<SourceText> {
  const hit = sourceCache.get(url);
  if (hit) return hit;
  const doc = await fetchStoryDocument(url);
  sourceCache.set(url, doc);
  return doc;
}

export async function getSourceText(url: string): Promise<string> {
  return (await getSourceDocument(url)).text;
}

/**
 * The only flags a model may raise. A fixed vocabulary keeps the decision
 * below a lookup rather than a second opinion about free text.
 */
export const CONTENT_WARNINGS = [
  "graphic-violence",
  "death",
  "cannibalism",
  "sexual-content",
  "self-harm",
  "cruelty-to-animals",
  "substance-use",
  "horror",
] as const;

export type ContentWarning = (typeof CONTENT_WARNINGS)[number];

/**
 * How badly each flag fits a picture book for ages 6-10, from 0 to 10.
 * Fairy tales are full of dying kings and dark woods, so those sit low: the
 * fidelity rules keep every major event, which only works when the events are
 * ones a child may meet at all.
 */
const WARNING_SEVERITY: Record<ContentWarning, number> = {
  "sexual-content": 10,
  cannibalism: 9,
  "self-harm": 9,
  "graphic-violence": 8,
  horror: 5,
  "cruelty-to-animals": 5,
  "substance-use": 3,
  death: 2,
};

/**
 * The one dial to turn. A story is refused when any of its flags scores this
 * or higher, which is why a death in a fairy tale (2) and a dark wood (5) are
 * fine while cannibalism (9) and graphic violence (8) are not. Lower it to be
 * stricter, raise it to let more through.
 */
export const CONTENT_SEVERITY_LIMIT = 7;

/** Wording a grown-up can read aloud to the child who asked for the book. */
const WARNING_LABEL: Record<ContentWarning, string> = {
  "sexual-content": "grown-up romance",
  cannibalism: "people being eaten",
  "self-harm": "someone hurting themselves on purpose",
  "graphic-violence": "violence shown in painful detail",
  horror: "frightening scenes",
  "cruelty-to-animals": "animals being hurt",
  "substance-use": "drinking or drugs",
  death: "a character dying",
};

export type PlotSpine = {
  characters: string[];
  events: string[];
  /** Same lists in Thai, for the Thai UI. */
  charactersTh?: string[];
  eventsTh?: string[];
  /** What the story contains that a 6-10 picture book might not survive. */
  warnings: ContentWarning[];
};

export type ContentVerdict = {
  ok: boolean;
  /** The flags that pushed this story over the line. */
  blocking: ContentWarning[];
  /** The worst score found, so a caller can see how close it came. */
  severity: number;
};

/** Decide whether this story can become a picture book for ages 6-10. */
export function assessPictureBookSafety(spine: PlotSpine): ContentVerdict {
  const warnings = spine.warnings ?? [];
  let severity = 0;
  const blocking: ContentWarning[] = [];
  for (const warning of warnings) {
    const score = WARNING_SEVERITY[warning] ?? 0;
    if (score > severity) severity = score;
    if (score >= CONTENT_SEVERITY_LIMIT) blocking.push(warning);
  }
  return { ok: blocking.length === 0, blocking, severity };
}

/**
 * Refuse an unsuitable source out loud. This runs on the spine, which is the
 * last step before pictures start costing money, and softening the story is
 * not an option: FIDELITY_RULES deliberately keep every major event.
 */
export function assertPictureBookSafe(spine: PlotSpine): void {
  const verdict = assessPictureBookSafety(spine);
  if (verdict.ok) return;
  const reasons = verdict.blocking.map((w) => WARNING_LABEL[w]).join(", and ");
  throw new Error(
    `This story is for grown-ups, not for children aged 6-10 — it has ${reasons}. ` +
      `StoryLingo stopped before drawing anything. Please pick a gentler story.`,
  );
}

const FIDELITY_RULES =
  `FAITHFULNESS RULES (very important):\n` +
  `- Keep the real story. Use the original character names and their real roles.\n` +
  `- Keep every major event, in the original order, including confrontations, fights and setbacks.\n` +
  `- Keep the original ending. Never invent a different ending or a new plot.\n` +
  `- Never add characters or events that are not in the source, and never drop a key event.\n` +
  `- You may only simplify: shorter sentences, simpler words, and gore or cruelty described gently ` +
  `(the event still happens, it is just told kindly for ages 6-10).\n` +
  `- Use your own wording (do not copy sentences from the source), but never change what happens.`;

/** Keep only flags from the fixed vocabulary; anything invented is dropped. */
function parseContentWarnings(value: unknown): ContentWarning[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>(CONTENT_WARNINGS);
  const out: ContentWarning[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const flag = item.trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (known.has(flag) && !out.includes(flag as ContentWarning)) out.push(flag as ContentWarning);
  }
  return out;
}

/** Pull the real characters and ordered events out of the source before planning. */
export async function extractPlotSpine(storyText: string): Promise<PlotSpine> {
  const raw = await chatJson<{
    characters?: unknown;
    events?: unknown;
    characters_th?: unknown;
    events_th?: unknown;
    content_warnings?: unknown;
  }>(
    "You are a careful story analyst. You extract facts from a story exactly as written, never inventing. Reply with JSON only.",
    `Story source:\n"""${storyText}"""\n\n` +
      `List the real characters (with their real names) and every important event in the order it happens. ` +
      `Do not soften, skip or invent anything — include fights, deaths, tricks and the ending.\n` +
      `Also say what this story contains that a parent would want to know about before reading it to a child of 6-10.\n` +
      `Return JSON: {"characters": [string (name — one short role description)], "events": [string (one short English sentence per event, in order, 10-40 events)], ` +
      `"characters_th": [string (the SAME characters, same order, written in Thai)], ` +
      `"events_th": [string (the SAME events, same order, written in Thai)], ` +
      `"content_warnings": [string (zero or more ids, EXACTLY from this list and nothing else: ${CONTENT_WARNINGS.join(", ")})]}\n` +
      `Flag only what actually happens in this source: "death" for any character dying, "graphic-violence" for ` +
      `killing, torture or wounds described in detail, "cannibalism" for anyone eaten, "horror" for scenes ` +
      `meant to terrify. Judge the source as written, not the gentle version you would tell a child.`,
  );
  const list = (v: unknown, max: number) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, max)
      : [];
  const characters = list(raw.characters, 20);
  const events = list(raw.events, 40);
  const charactersTh = list(raw.characters_th, 20);
  const eventsTh = list(raw.events_th, 40);
  return {
    characters,
    events,
    // Only trust the Thai lists when they line up one-to-one with the English ones.
    charactersTh: charactersTh.length === characters.length ? charactersTh : undefined,
    eventsTh: eventsTh.length === events.length ? eventsTh : undefined,
    warnings: parseContentWarnings(raw.content_warnings),
  };
}

export async function buildOutline(
  storyText: string,
  fallbackTitle: string,
  chapterCount: number,
  spine?: PlotSpine,
): Promise<Outline> {
  const plotSpine = spine ?? (await extractPlotSpine(storyText).catch(() => null));
  // The last cheap moment: every illustration after this point costs money, so
  // an unsuitable source is refused here rather than quietly softened.
  //
  // A spine that could not be read is refused as well. Carrying on would make
  // the check skippable by whatever stops the model answering, and a gate that
  // opens when something goes wrong is not protecting anybody.
  if (!plotSpine) {
    throw new Error(
      "StoryLingo could not read that story well enough to check it suits a picture book. Please try again in a moment.",
    );
  }
  assertPictureBookSafe(plotSpine);
  const spineText = plotSpine
    ? `Characters in the real story: ${plotSpine.characters.join("; ") || "(none found)"}\n` +
      `Real events in order:\n${plotSpine.events.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n\n`
    : "";

  const raw = await chatJson<unknown>(
    "You are a children's story editor building beginner Mandarin learning material for Thai-speaking children aged 6-10. " +
      "You retell stories in your own words but you NEVER change what happens — the plot, characters and ending stay true to the source. " +
      "Reply with JSON only.",
    `Source material:\n"""${storyText}"""\n\n` +
      spineText +
      `Working title: ${fallbackTitle}\n` +
      `${FIDELITY_RULES}\n\n` +
      `Plan a faithful retelling with exactly ${chapterCount} short chapters that together cover ALL of the real events above, in order.\n` +
      `Return JSON: {"title": string (a friendly title in English, close to the real story's title), "blurb": string (one short English sentence), ` +
      `"title_th": string (the same title in natural Thai for a child), "blurb_th": string (the same blurb in Thai), ` +
      `"characters": [string (the real character names used in this book)], ` +
      `"chapters": [{"title": string (short, English), "title_th": string (that chapter title in Thai), "summary": string (2-3 sentences describing what really happens, in English), ` +
      `"keyEvents": [string (3-5 short beats from the real story that this chapter must cover, in order)], ` +
      `"illustration": string (a vivid English description of one scene to paint, no text in image)}]}` +
      (chapterCount === 1
        ? `\nThis is a ONE-chapter book, so that single chapter must cover the whole real story from beginning to its real ending.`
        : ``),
  );
  return parseOutline(raw, chapterCount);
}

export type ChapterContent = { pages: Page[]; words: Word[] };

export async function buildChapterContent(
  bookTitle: string,
  chapterIdx: number,
  chapterTitle: string,
  chapterSummary: string,
  knownWords: string[],
  keyEvents: string[] = [],
  sourceExcerpt = "",
  bible?: { cast: BibleEntry[]; places: BibleEntry[] } | null,
): Promise<ChapterContent> {
  const beats = keyEvents.length
    ? `Beats from the real story this chapter MUST cover, in order:\n${keyEvents
        .map((e, i) => `${i + 1}. ${e}`)
        .join("\n")}\n`
    : "";
  const source = sourceExcerpt.trim()
    ? `Original source (for facts only — do not copy its wording):\n"""${sourceExcerpt.trim().slice(0, 6000)}"""\n\n`
    : "";
  const castNames = (bible?.cast ?? []).map((c) => c.name);
  const placeNames = (bible?.places ?? []).map((p) => p.name);
  const bibleNames =
    castNames.length || placeNames.length
      ? `This book's characters: ${castNames.join("; ") || "(none)"}\n` +
        `This book's places: ${placeNames.join("; ") || "(none)"}\n` +
        `For every page, tag which of these characters and which place the picture shows, using these EXACT names.\n`
      : "";

  const ask = () =>
    chatJson<unknown>(
    "You write beginner Mandarin Chinese reading material for Thai-speaking children. " +
      "Everything must be your own original simple writing (HSK1-HSK2 level), never copied text, " +
      "but the events, characters and ending must stay true to the source story. " +
      "Pinyin must include tone marks. Thai translations must be natural Thai. Reply with JSON only.",
    source +
      `Book: ${bookTitle}\nChapter ${chapterIdx}: ${chapterTitle}\nWhat happens: ${chapterSummary}\n` +
      beats +
      bibleNames +
      `Words already taught (reuse some of these): ${knownWords.slice(0, 60).join(", ") || "none yet"}\n\n` +
      `${FIDELITY_RULES}\n\n` +
      `Write this chapter as 2 or 3 pages. Each page has 5 to 8 very short sentences (4-10 characters each). ` +
      `Every listed beat must actually appear in the sentences.\n` +
      `Return JSON:\n` +
      `{"pages":[{"scene":"a vivid English description of one picture to paint for this page (no text in image)",` +
      `"cast":["character names from the list above that appear in this picture"],"place":"the place name from the list above",` +
      `"sentences":[{"hanzi":"简体中文句子","pinyin":"jiǎn tǐ zhōng wén jù zi","native":"ประโยคภาษาไทย",` +
      `"words":[{"hanzi":"词","pinyin":"cí","dict":"ความหมายทั่วไปในพจนานุกรม (Thai)","context":"ความหมายในประโยคนี้ (Thai)"}]}]}],` +
      `"words":[{"hanzi":"词","pinyin":"cí","dict":"ความหมายทั่วไป (Thai)"}]}\n\n` +
      `Every page MUST include its own "scene" description. One picture is painted per page, so that ` +
      `scene has to cover what happens across the whole page, not just its first line. Give sentences ` +
      `no scene of their own. Scenes never contain text or letters. ` +

      `Rules: split every sentence into its real words (1-3 characters each, no punctuation as a word). ` +
      `"dict" is the GENERAL dictionary meaning of the word on its own; "context" is what it means in that sentence. ` +
      `The top-level "words" array holds 6 to 10 key vocabulary words for this chapter's quiz. ` +
      `Pinyin MUST use tone-mark letters (nǐ hǎo), never tone numbers (ni3 hao3) and never bare letters, ` +
      `and must apply 不/一 tone sandhi (不是 = bú shì, 一样 = yí yàng, 一天 = yì tiān). ` +
      `Give each of the 6-10 quiz words a DIFFERENT dictionary meaning so quiz choices are never ambiguous.`,
  );

  // Models occasionally emit malformed JSON; retry once before giving up.
  try {
    return parseChapterContent(await ask());
  } catch (err) {
    if (!(err instanceof StoryValidationError)) throw err;
    console.warn("Chapter content failed validation, retrying:", err.message);
    return parseChapterContent(await ask());
  }
}


/**
 * Write the book's visual bible once: a fixed look for each character and
 * place. The exact same wording is reused in every page prompt afterwards,
 * which is what keeps a book consistent across chapters.
 */
export async function buildStoryBible(
  storyText: string,
  spine?: PlotSpine | null,
): Promise<{ cast: BibleEntry[]; places: BibleEntry[] }> {
  const known = spine?.characters?.length
    ? `Characters found in the story: ${spine.characters.join("; ")}\n`
    : "";
  try {
    const raw = await chatJson<{ cast?: unknown; places?: unknown }>(
      "You are an art director writing a visual bible for a children's picture book. " +
        "Descriptions must be concrete, physical and repeatable. Reply with JSON only.",
      `Story source:\n"""${storyText.slice(0, 12000)}"""\n\n` +
        known +
        `Write ONE fixed visual description for each important character and each recurring place. ` +
        `These descriptions will be pasted into every illustration prompt for the whole book, so they must be ` +
        `specific and unchanging: for a character give species/age, build, face, hair, eye colour, exact clothing ` +
        `colours and any distinguishing mark; for a place give architecture or landscape, key objects, colour ` +
        `palette and time of day. Do not mention art style, camera or mood. 25-45 words each.\n` +
        `Return JSON: {"cast":[{"name":"the character's name as used in the story","description":"..."}],` +
        `"places":[{"name":"the place name","description":"..."}]}`,
    );
    return {
      cast: parseBibleEntries(raw.cast, 12),
      places: parseBibleEntries(raw.places, 8),
    };
  } catch (err) {
    console.warn("Could not build the story bible", err);
    return { cast: [], places: [] };
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0e00-\u0e7f\u4e00-\u9fff]+/g, " ").trim();

/** Pick the bible entries a page needs, from its tags or from its scene text. */
export function matchBibleEntries(
  page: Page,
  cast: BibleEntry[],
  places: BibleEntry[],
  extraText = "",
): BibleEntry[] {
  const scene = norm([page.scene ?? "", ...(page.cast ?? []), page.place ?? "", extraText].join(" "));
  const hit = (e: BibleEntry) => {
    const name = norm(e.name.split(/[—\-(,]/)[0] ?? e.name);
    return name.length > 1 && scene.includes(name);
  };
  const chosen = [...cast.filter(hit)];
  const place = places.find(hit);
  if (place) chosen.push(place);
  return chosen.slice(0, 5);
}

/** A painted reference picture, stored once per book. */
export type AnchorRef = { name: string; path: string };
export type Anchors = { cast: AnchorRef[]; places: AnchorRef[] };

export function parseAnchors(raw: unknown): Anchors {
  const list = (value: unknown): AnchorRef[] =>
    Array.isArray(value)
      ? value
          .filter(
            (e): e is AnchorRef =>
              !!e && typeof (e as AnchorRef).name === "string" && typeof (e as AnchorRef).path === "string",
          )
          .map((e) => ({ name: e.name, path: e.path }))
          .slice(0, 8)
      : [];
  const obj = (raw ?? {}) as { cast?: unknown; places?: unknown };
  return { cast: list(obj.cast), places: list(obj.places) };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "x";

/** Turn a stored art path into a short-lived URL the image model can fetch. */
async function signedAnchorUrls(paths: string[]): Promise<string[]> {
  const urls: string[] = [];
  for (const path of paths) {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      console.warn(`Anchor reference unavailable (${path})`, error?.message);
      continue;
    }
    urls.push(data.signedUrl);
  }
  return urls;
}

/**
 * Paint the book's reference pictures once: a character sheet for each main
 * character and an empty establishing view for each recurring place. Every
 * page illustration afterwards is generated with these attached, which is
 * what actually locks a face or a forest across chapters.
 *
 * Failure is never fatal — a book without anchors simply falls back to the
 * text-only bible it used before.
 */
export async function buildAnchors(
  bookId: string,
  bible: { cast: BibleEntry[]; places: BibleEntry[] },
  styleId?: string | null,
): Promise<Anchors> {
  const cast = bible.cast.slice(0, 4);
  const places = bible.places.slice(0, 3);

  const paint = async (kind: "cast" | "place", entry: BibleEntry): Promise<AnchorRef | null> => {
    const name = `anchor-${kind}-${slug(entry.name)}`;
    const brief =
      kind === "cast"
        ? `Character reference sheet for a children's picture book. Show ONLY this one character, ` +
          `alone, against a plain flat neutral background: a full-body standing view on the left and a ` +
          `larger head-and-shoulders view on the right. Neutral friendly expression, even lighting, no props, ` +
          `no scenery, no other characters.\n\nThe character: ${entry.name} — ${entry.description}`
        : `Location reference view for a children's picture book. Show ONLY this place, wide establishing ` +
          `shot, completely empty of people and animals. Fixed palette, fixed time of day, no characters.` +
          `\n\nThe place: ${entry.name} — ${entry.description}`;
    try {
      const url = await makeArt(bookId, name, brief, styleId, null, [], []);
      return { name: entry.name, path: url.replace(/^\/api\/public\/art\//, "").split("?")[0]! };
    } catch (err) {
      console.warn(`Anchor for ${entry.name} failed`, err);
      return null;
    }
  };

  const [castRefs, placeRefs] = await Promise.all([
    Promise.all(cast.map((e) => paint("cast", e))),
    Promise.all(places.map((e) => paint("place", e))),
  ]);

  const anchors = {
    cast: castRefs.filter((r): r is AnchorRef => !!r),
    places: placeRefs.filter((r): r is AnchorRef => !!r),
  };
  console.log(
    `Anchors for book ${bookId}: ${anchors.cast.length} character sheets, ${anchors.places.length} places`,
  );
  return anchors;
}

/** Pick the anchor pictures a page needs, from the bible entries it matched. */
function matchAnchors(entries: BibleEntry[], anchors: Anchors | null | undefined): string[] {
  if (!anchors) return [];
  const wanted = entries.map((e) => norm(e.name));
  const all = [...anchors.cast, ...anchors.places];
  return all
    .filter((a) => wanted.includes(norm(a.name)))
    .map((a) => a.path)
    .slice(0, 4);
}

/**
 * Paint the chapter's illustrations: exactly one picture per page, which holds
 * still for every sentence on that page.
 */
export async function illustratePages(
  bookId: string,
  chapterIdx: number,
  chapterTitle: string,
  pages: Page[],
  styleId?: string | null,
  characterPrompt?: string | null,
  bible?: { cast: BibleEntry[]; places: BibleEntry[] } | null,
  anchors?: Anchors | null,
): Promise<Page[]> {

  type Job = { page: number; scene: string; name: string };

  const jobs: Job[] = pages.map((page, i) => ({
    page: i,
    scene: page.scene?.trim() || `${chapterTitle}: ${page.sentences[0]?.native ?? ""}`,
    name: `chapter-${chapterIdx}-page-${i + 1}`,
  }));

  const results = new Array<string | null>(jobs.length).fill(null);
  let next = 0;

  // A small pool keeps a long chapter from firing a dozen image calls at once.
  const worker = async () => {
    while (true) {
      const k = next++;
      if (k >= jobs.length) return;
      const job = jobs[k]!;
      const page = pages[job.page]!;
      try {
        results[k] = await makeArt(
          bookId,
          job.name,
          job.scene,
          styleId,
          characterPrompt,
          bible ? matchBibleEntries(page, bible.cast, bible.places, job.scene) : [],
        );
      } catch (err) {
        console.error(`Illustration ${job.name} failed`, err);
        results[k] = null;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, worker));

  // Any per-sentence art a book picked up earlier is cleared, so a repaint
  // never leaves a page pointing at both a new picture and stale old ones.
  const out = pages.map((p) => ({
    ...p,
    sentences: p.sentences.map((s) => ({ ...s, image_url: null })),
  }));
  jobs.forEach((job, k) => {
    out[job.page]!.image_url = results[k];
  });
  return out;
}


/** Generate an illustration, store it, and return its public app URL. */
export async function makeArt(
  bookId: string,
  name: string,
  scene: string,
  styleId?: string | null,
  /**
   * Kept for older callers only. The child's buddy is no longer painted into
   * the picture — books are shared by every reader, so the buddy is drawn on
   * top of the page as that child's own sprite instead.
   */
  _characterPrompt?: string | null,
  refs: BibleEntry[] = [],
  /** Stored anchor pictures for the characters and place in this scene. */
  anchorPaths: string[] = [],
): Promise<string> {
  const style = artStylePrompt(styleId);
  // The same locked wording goes into every picture of this book, so the
  // characters and places look identical from chapter to chapter.
  const locked = refs.length
    ? `\n\nFIXED APPEARANCES (must match exactly — these characters and places already appeared ` +
      `earlier in this book and must look identical, same face, same clothes, same colours):\n` +
      refs.map((r) => `- ${r.name}: ${r.description}`).join("\n")
    : "";
  // Words alone get re-interpreted on every call; the reference sheets are
  // what actually hold a character's face still across a whole book.
  const anchorUrls = anchorPaths.length ? await signedAnchorUrls(anchorPaths) : [];
  const anchored = anchorUrls.length
    ? `\n\nREFERENCE IMAGES: the attached pictures are this book's official character sheets and location ` +
      `views. Copy them exactly — identical faces, bodies, clothing shapes and colours for the characters, ` +
      `and the same architecture, landscape, palette and time of day for the location. Do not redesign ` +
      `anything shown in them. Place these characters into the new scene below, in the poses and actions ` +
      `the scene describes; ignore the reference sheets' plain backgrounds and neutral poses.`
    : "";
  const bytes = await generateIllustration(
    `Scene (this decides WHAT is depicted — the location, characters, action, weather and time of day): ${scene}\n\n` +
      `Composition: a single wide 16:9 storybook illustration. Choose the framing the scene calls for ` +
      `(wide establishing, medium, or close-up), keep every character fully inside the frame, and light the ` +
      `picture to match the time of day in the scene. No panels, no split images, no text.\n\n` +
      `Style (this decides ONLY HOW it is painted — medium, brushwork, texture, palette and mood, for every ` +
      `element including any characters): ${style}\n\n` +
      `If the style wording and the scene ever disagree about the setting, landscape, weather or time of day, ` +
      `the scene always wins; treat the style purely as painting technique.${anchored}${locked}`,
    anchorUrls,
  );


  // Store a resized WebP when we can — the raw PNG is ~2 MB, the WebP ~150 KB.
  const image = await toWebp(bytes, 1280, 78);
  const path = `${bookId}/${name}.${image.extension}`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, image.bytes, { contentType: image.contentType, upsert: true });
  if (error) throw new Error(`Could not store illustration: ${error.message}`);

  // Covers are shown small on the bookshelf, so keep a thumbnail beside them.
  if (name === "cover") {
    try {
      const thumb = await toWebp(bytes, 480, 70);
      if (thumb.extension !== "webp") {
        console.warn("Cover thumbnail skipped: WebP conversion was unavailable");
        return `/api/public/art/${path}`;
      }
      const { error: thumbError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(`${bookId}/${name}-thumb.webp`, thumb.bytes, {
          contentType: thumb.contentType,
          upsert: true,
        });
      if (thumbError) throw new Error(thumbError.message);
      console.log(`Cover thumbnail stored: ${bookId}/${name}-thumb.webp`);
    } catch (err) {
      console.warn("Cover thumbnail skipped", err);
    }
  }
  return `/api/public/art/${path}`;
}



export type StoryPreview = {
  title: string;
  blurb: string;
  suggestedChapters: number;
  reason: string;
  chapterTitles: string[];
  wordCount: number;
  artStyle: ArtStyleId;
  artStyleReason: string;
  characters: string[];
  keyEvents: string[];
  /** How much readable text the source held, before the 24k budget cut it. */
  sourceChars: number;
  /** True when only the first part of the source was planned from. */
  truncated: boolean;
  /** Only set when the link had a "#" anchor: whether it was found. */
  fragmentResolved?: boolean;
  /** Thai versions of every free-text field, for the Thai UI. */
  th: {
    title: string;
    blurb: string;
    reason: string;
    chapterTitles: string[];
    artStyleReason: string;
    characters: string[];
    keyEvents: string[];
  };
};

type PreviewRaw = {
  title?: string;
  blurb?: string;
  suggestedChapters?: number;
  reason?: string;
  chapterTitles?: unknown;
  artStyle?: string;
  artStyleReason?: string;
  title_th?: string;
  blurb_th?: string;
  reason_th?: string;
  chapterTitles_th?: unknown;
  artStyleReason_th?: string;
};

/** Read a source link and suggest how many chapters the picture book should have. */
export async function previewStory(url: string, fallbackTitle: string): Promise<StoryPreview> {
  const source = await getSourceDocument(url);
  const storyText = source.text;
  const [raw, spine] = await Promise.all([
    chatJson<PreviewRaw>(
      "You are a children's book editor planning beginner Mandarin picture books for Thai-speaking children aged 6-10. " +
        "You retell in your own words but never change the real plot. Reply with JSON only.",
      `Source material (understand the plot only):\n"""${storyText.slice(0, 12000)}"""\n\n` +
        `Working title: ${fallbackTitle || "(none given)"}\n` +
        `Decide how many short chapters this retelling should have (between 1 and 10). ` +
        `Short simple stories need 1-3; longer or multi-episode material needs more.\n` +
        `Also choose the illustration style whose culture and historical period best matches the story's ` +
        `origin and setting. Choose exactly one id from: ${ART_STYLE_MENU}. ` +
        `Use "${DEFAULT_ART_STYLE}" only for modern stories or when the origin is unclear.\n` +
        `Every text field must also be given in Thai (the "_th" fields), saying exactly the same thing.\n` +
        `Return JSON: {"title": string (friendly English title, close to the real story's title), "blurb": string (one short English sentence), ` +
        `"suggestedChapters": number (1-10), "reason": string (one short English sentence explaining the number), ` +
        `"chapterTitles": [string] (one short English title per suggested chapter), ` +
        `"artStyle": string (one id from the list), ` +
        `"artStyleReason": string (one short English sentence, e.g. "Classical Chinese fable set in the Tang dynasty"), ` +
        `"title_th": string, "blurb_th": string, "reason_th": string, ` +
        `"chapterTitles_th": [string] (same chapters, same order, in Thai), "artStyleReason_th": string}`,
    ),
    extractPlotSpine(storyText).catch(
      () => ({ characters: [], events: [], warnings: [] }) as PlotSpine,
    ),
  ]);

  const suggested = Math.min(10, Math.max(1, Math.round(Number(raw.suggestedChapters) || 3)));
  const strings = (v: unknown, max: number) =>
    Array.isArray(v)
      ? v.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim()).slice(0, max)
      : [];
  const titles = strings(raw.chapterTitles, suggested);
  const titlesTh = strings(raw.chapterTitles_th, suggested);

  const title = (raw.title ?? "").trim() || fallbackTitle || "A new story";
  const blurb = (raw.blurb ?? "").trim();
  const reason = (raw.reason ?? "").trim();
  const artStyleReason = (raw.artStyleReason ?? "").trim();

  return {
    title,
    blurb,
    suggestedChapters: suggested,
    reason,
    chapterTitles: titles,
    wordCount: estimateWordCount(storyText),
    artStyle: isArtStyleId(raw.artStyle) ? raw.artStyle : DEFAULT_ART_STYLE,
    artStyleReason,
    characters: spine.characters,
    keyEvents: spine.events,
    sourceChars: source.sourceChars,
    truncated: source.truncated,
    fragmentResolved: source.fragmentResolved,
    // Fall back to the English text whenever the Thai copy is missing or mismatched.
    th: {
      title: (raw.title_th ?? "").trim() || title,
      blurb: (raw.blurb_th ?? "").trim() || blurb,
      reason: (raw.reason_th ?? "").trim() || reason,
      chapterTitles: titlesTh.length === titles.length ? titlesTh : titles,
      artStyleReason: (raw.artStyleReason_th ?? "").trim() || artStyleReason,
      characters: spine.charactersTh ?? spine.characters,
      keyEvents: spine.eventsTh ?? spine.events,
    },
  };
}


