import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ART_STYLE, chatJson, generateIllustration } from "./ai.server";
import type { Page, Word } from "./types";
import { StoryValidationError, parseChapterContent, parseOutline } from "./story-schema";
import type { Outline } from "./story-schema";

const BUCKET = "story-art";

export type { Outline };

/** Fetch a web page and reduce it to readable plain text. */
export async function fetchStoryText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StoryLingoBot/1.0)" },
  });
  if (!res.ok) throw new Error(`Could not read that page (status ${res.status}).`);
  const html = await res.text();
  const text = html
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

  if (text.length < 200) {
    throw new Error("That page didn't contain enough story text to work with.");
  }
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
      `{"pages":[{"sentences":[{"hanzi":"简体中文句子","pinyin":"jiǎn tǐ zhōng wén jù zi","native":"ประโยคภาษาไทย",` +
      `"words":[{"hanzi":"词","pinyin":"cí","dict":"ความหมายทั่วไปในพจนานุกรม (Thai)","context":"ความหมายในประโยคนี้ (Thai)"}]}]}],` +
      `"words":[{"hanzi":"词","pinyin":"cí","dict":"ความหมายทั่วไป (Thai)"}]}\n\n` +
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

/** Generate an illustration, store it, and return its public app URL. */
export async function makeArt(bookId: string, name: string, scene: string): Promise<string> {
  const bytes = await generateIllustration(`${scene}\n\nStyle: ${ART_STYLE}`);
  const path = `${bookId}/${name}.png`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Could not store illustration: ${error.message}`);
  return `/api/public/art/${path}`;
}
