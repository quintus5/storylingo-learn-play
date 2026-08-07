import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatJson, generateIllustration } from "./ai.server";
import { ART_STYLE_MENU, DEFAULT_ART_STYLE, artStylePrompt, isArtStyleId } from "./art-styles";
import type { ArtStyleId } from "./art-styles";
import type { Page, Word } from "./types";
import { StoryValidationError, parseChapterContent, parseOutline } from "./story-schema";
import type { Outline } from "./story-schema";

const BUCKET = "story-art";

export type { Outline };

export { assertReadable, estimateWordCount, junkRatio } from "./readable";
import { assertReadable, estimateWordCount } from "./readable";

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
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
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

/** Fetch a web page or PDF and reduce it to readable plain text. */
export async function fetchStoryText(url: string): Promise<string> {
  const res = await safeFetch(url);
  if (!res.ok) throw new Error(`Could not read that page (status ${res.status}).`);

  const declaredSize = Number(res.headers.get("content-length") ?? 0);
  if (declaredSize > 20_000_000) throw new Error("That file is too large to read.");



  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const looksPdf = contentType.includes("pdf") || /\.pdf(\?|#|$)/i.test(url);

  let text: string;
  if (looksPdf) {
    text = await extractPdfText(await res.arrayBuffer());
  } else if (contentType.includes("html") || contentType.includes("xml") || !contentType) {
    text = extractHtmlText(await res.text());
  } else if (contentType.startsWith("text/")) {
    text = (await res.text()).replace(/\s+/g, " ").trim();
  } else {
    throw new Error("That link isn't a readable story page or PDF.");
  }

  assertReadable(text);
  return text.slice(0, 24000);
}



/** Cache source text per URL for the lifetime of the worker instance. */
const sourceCache = new Map<string, string>();

export async function getSourceText(url: string): Promise<string> {
  const hit = sourceCache.get(url);
  if (hit) return hit;
  const text = await fetchStoryText(url);
  sourceCache.set(url, text);
  return text;
}

export type PlotSpine = {
  characters: string[];
  events: string[];
  /** Same lists in Thai, for the Thai UI. */
  charactersTh?: string[];
  eventsTh?: string[];
};

const FIDELITY_RULES =
  `FAITHFULNESS RULES (very important):\n` +
  `- Keep the real story. Use the original character names and their real roles.\n` +
  `- Keep every major event, in the original order, including confrontations, fights and setbacks.\n` +
  `- Keep the original ending. Never invent a different ending or a new plot.\n` +
  `- Never add characters or events that are not in the source, and never drop a key event.\n` +
  `- You may only simplify: shorter sentences, simpler words, and gore or cruelty described gently ` +
  `(the event still happens, it is just told kindly for ages 6-10).\n` +
  `- Use your own wording (do not copy sentences from the source), but never change what happens.`;

/** Pull the real characters and ordered events out of the source before planning. */
export async function extractPlotSpine(storyText: string): Promise<PlotSpine> {
  const raw = await chatJson<{
    characters?: unknown;
    events?: unknown;
    characters_th?: unknown;
    events_th?: unknown;
  }>(
    "You are a careful story analyst. You extract facts from a story exactly as written, never inventing. Reply with JSON only.",
    `Story source:\n"""${storyText}"""\n\n` +
      `List the real characters (with their real names) and every important event in the order it happens. ` +
      `Do not soften, skip or invent anything — include fights, deaths, tricks and the ending.\n` +
      `Return JSON: {"characters": [string (name — one short role description)], "events": [string (one short English sentence per event, in order, 10-40 events)], ` +
      `"characters_th": [string (the SAME characters, same order, written in Thai)], ` +
      `"events_th": [string (the SAME events, same order, written in Thai)]}`,
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
  };
}

export async function buildOutline(
  storyText: string,
  fallbackTitle: string,
  chapterCount: number,
  spine?: PlotSpine,
): Promise<Outline> {
  const plotSpine = spine ?? (await extractPlotSpine(storyText).catch(() => null));
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
      `"characters": [string (the real character names used in this book)], ` +
      `"chapters": [{"title": string (short, English), "summary": string (2-3 sentences describing what really happens, in English), ` +
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
): Promise<ChapterContent> {
  const beats = keyEvents.length
    ? `Beats from the real story this chapter MUST cover, in order:\n${keyEvents
        .map((e, i) => `${i + 1}. ${e}`)
        .join("\n")}\n`
    : "";
  const source = sourceExcerpt.trim()
    ? `Original source (for facts only — do not copy its wording):\n"""${sourceExcerpt.trim().slice(0, 6000)}"""\n\n`
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
      `Words already taught (reuse some of these): ${knownWords.slice(0, 60).join(", ") || "none yet"}\n\n` +
      `${FIDELITY_RULES}\n\n` +
      `Write this chapter as 2 or 3 pages. Each page has 5 to 8 very short sentences (4-10 characters each). ` +
      `Every listed beat must actually appear in the sentences.\n` +
      `Return JSON:\n` +
      `{"pages":[{"scene":"a vivid English description of one picture to paint for this page (no text in image)","sentences":[{"hanzi":"简体中文句子","pinyin":"jiǎn tǐ zhōng wén jù zi","native":"ประโยคภาษาไทย",` +
      `"words":[{"hanzi":"词","pinyin":"cí","dict":"ความหมายทั่วไปในพจนานุกรม (Thai)","context":"ความหมายในประโยคนี้ (Thai)"}]}]}],` +
      `"words":[{"hanzi":"词","pinyin":"cí","dict":"ความหมายทั่วไป (Thai)"}]}\n\n` +
      `Every page MUST include its own "scene" description matching what happens on that page. ` +
      `Rules: split every sentence into its real words (1-3 characters each, no punctuation as a word). ` +
      `"dict" is the GENERAL dictionary meaning of the word on its own; "context" is what it means in that sentence. ` +
      `The top-level "words" array holds 6 to 10 key vocabulary words for this chapter's quiz.`,
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


/** Paint one illustration per page, all in parallel. */
export async function illustratePages(
  bookId: string,
  chapterIdx: number,
  chapterTitle: string,
  pages: Page[],
  styleId?: string | null,
  characterPrompt?: string | null,
): Promise<Page[]> {
  return Promise.all(
    pages.map(async (page, i) => {
      const scene = page.scene?.trim() || `${chapterTitle}: ${page.sentences[0]?.native ?? ""}`;
      try {
        const url = await makeArt(
          bookId,
          `chapter-${chapterIdx}-page-${i + 1}`,
          scene,
          styleId,
          characterPrompt,
        );
        return { ...page, image_url: url };
      } catch (err) {
        console.error(`Page ${i + 1} illustration failed`, err);
        return { ...page, image_url: null };
      }
    }),
  );
}

/** Generate an illustration, store it, and return its public app URL. */
export async function makeArt(
  bookId: string,
  name: string,
  scene: string,
  styleId?: string | null,
  characterPrompt?: string | null,
): Promise<string> {
  const buddy = characterPrompt?.trim() ? `\n\n${characterPrompt.trim()}` : "";
  const bytes = await generateIllustration(
    `${scene}${buddy}\n\nStyle: ${artStylePrompt(styleId)}`,
  );
  const path = `${bookId}/${name}.png`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Could not store illustration: ${error.message}`);
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
  const storyText = await getSourceText(url);
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
    extractPlotSpine(storyText).catch(() => ({ characters: [], events: [] }) as PlotSpine),
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


