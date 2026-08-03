import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatJson, generateIllustration } from "./ai.server";
import { ART_STYLE_MENU, DEFAULT_ART_STYLE, artStylePrompt, isArtStyleId } from "./art-styles";
import type { ArtStyleId } from "./art-styles";
import type { Page, Word } from "./types";
import { StoryValidationError, parseChapterContent, parseOutline } from "./story-schema";
import type { Outline } from "./story-schema";

const BUCKET = "story-art";

export type { Outline };

/** Reject text that is mostly binary junk rather than real prose. */
function assertReadable(text: string): void {
  if (text.length < 200) {
    throw new Error("That page didn't contain enough story text to work with.");
  }
  const readable = (text.match(/[\p{Letter}\p{Mark}\s.,!?'"—-]/gu) ?? []).length;
  if (readable / text.length < 0.8) {
    throw new Error(
      "That link didn't give back readable text — it looks like a file StoryLingo can't read.",
    );
  }
}

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
  if (BLOCKED_HOST.test(parsed.hostname) || !parsed.hostname.includes(".")) {
    throw new Error("That link points to a private address StoryLingo can't read.");
  }
  return parsed;
}

/** Fetch a web page or PDF and reduce it to readable plain text. */
export async function fetchStoryText(url: string): Promise<string> {
  const safe = assertSafeUrl(url);
  const res = await fetch(safe.toString(), {
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StoryLingoBot/1.0)" },
  });
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


export async function buildOutline(
  storyText: string,
  fallbackTitle: string,
  chapterCount: number,
): Promise<Outline> {
  const raw = await chatJson<unknown>(
    "You are a children's story editor building beginner Mandarin learning material for Thai-speaking children aged 6-10. " +
      "You must RETELL stories in your own original words — never reproduce, quote or closely paraphrase the source wording. " +
      "Reply with JSON only.",
    `Source material (for understanding the plot only, never copy its wording):\n"""${storyText}"""\n\n` +
      `Working title: ${fallbackTitle}\n` +
      `Write an ORIGINAL retelling plan with exactly ${chapterCount} short chapters.\n` +
      `Return JSON: {"title": string (a friendly retold title in English), "blurb": string (one short English sentence), ` +
      `"chapters": [{"title": string (short, English), "summary": string (2-3 sentences describing what happens, in English), ` +
      `"illustration": string (a vivid English description of one scene to paint, no text in image)}]}` +
      (chapterCount === 1
        ? `\nThis is a ONE-chapter book, so that single chapter must be a complete little story with a beginning, middle and happy ending.`
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
): Promise<ChapterContent> {
  const ask = () =>
    chatJson<unknown>(
    "You write beginner Mandarin Chinese reading material for Thai-speaking children. " +
      "Everything must be your own original simple writing (HSK1-HSK2 level), never copied text. " +
      "Pinyin must include tone marks. Thai translations must be natural Thai. Reply with JSON only.",
    `Book: ${bookTitle}\nChapter ${chapterIdx}: ${chapterTitle}\nWhat happens: ${chapterSummary}\n` +
      `Words already taught (reuse some of these): ${knownWords.slice(0, 60).join(", ") || "none yet"}\n\n` +
      `Write this chapter as 2 or 3 pages. Each page has 5 to 8 very short sentences (4-10 characters each).\n` +
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
): Promise<Page[]> {
  return Promise.all(
    pages.map(async (page, i) => {
      const scene = page.scene?.trim() || `${chapterTitle}: ${page.sentences[0]?.native ?? ""}`;
      try {
        const url = await makeArt(bookId, `chapter-${chapterIdx}-page-${i + 1}`, scene, styleId);
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
): Promise<string> {
  const bytes = await generateIllustration(`${scene}\n\nStyle: ${artStylePrompt(styleId)}`);
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
};

/** Read a source link and suggest how many chapters the picture book should have. */
export async function previewStory(url: string, fallbackTitle: string): Promise<StoryPreview> {
  const storyText = await fetchStoryText(url);
  const raw = await chatJson<Partial<StoryPreview> & { artStyle?: string }>(
    "You are a children's book editor planning beginner Mandarin picture books for Thai-speaking children aged 6-10. " +
      "You never copy source wording — you plan an original retelling. Reply with JSON only.",
    `Source material (understand the plot only):\n"""${storyText.slice(0, 12000)}"""\n\n` +
      `Working title: ${fallbackTitle || "(none given)"}\n` +
      `Decide how many short chapters this retelling should have (between 1 and 10). ` +
      `Short simple stories need 1-3; longer or multi-episode material needs more.\n` +
      `Also choose the illustration style whose culture and historical period best matches the story's ` +
      `origin and setting. Choose exactly one id from: ${ART_STYLE_MENU}. ` +
      `Use "${DEFAULT_ART_STYLE}" only for modern stories or when the origin is unclear.\n` +
      `Return JSON: {"title": string (friendly English title), "blurb": string (one short English sentence), ` +
      `"suggestedChapters": number (1-10), "reason": string (one short English sentence explaining the number), ` +
      `"chapterTitles": [string] (one short English title per suggested chapter), ` +
      `"artStyle": string (one id from the list), ` +
      `"artStyleReason": string (one short English sentence, e.g. "Classical Chinese fable set in the Tang dynasty")}`,
  );

  const suggested = Math.min(10, Math.max(1, Math.round(Number(raw.suggestedChapters) || 3)));
  const titles = (Array.isArray(raw.chapterTitles) ? raw.chapterTitles : [])
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .slice(0, suggested);

  return {
    title: (raw.title ?? "").trim() || fallbackTitle || "A new story",
    blurb: (raw.blurb ?? "").trim(),
    suggestedChapters: suggested,
    reason: (raw.reason ?? "").trim(),
    chapterTitles: titles,
    wordCount: storyText.split(/\s+/).filter(Boolean).length,
    artStyle: isArtStyleId(raw.artStyle) ? raw.artStyle : DEFAULT_ART_STYLE,
    artStyleReason: (raw.artStyleReason ?? "").trim(),
  };
}

