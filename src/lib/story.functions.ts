import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ART_STYLES, DEFAULT_ART_STYLE } from "./art-styles";

const ART_STYLE_IDS = ART_STYLES.map((s) => s.id) as [string, ...string[]];

const CreateBookInput = z.object({
  title: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(2000),
  chapterCount: z.number().int().min(1).max(10),
  artStyle: z.enum(ART_STYLE_IDS).optional(),
  /** Description of the reader's own character, painted into every picture. */
  characterPrompt: z.string().trim().max(600).optional(),
});

export const createBook = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateBookInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getSourceText, buildOutline } = await import("./story.server");

    const storyText = await getSourceText(data.url);
    const outline = await buildOutline(storyText, data.title, data.chapterCount);

    const chapters = (outline.chapters ?? []).slice(0, data.chapterCount);
    if (chapters.length < 1) throw new Error("Could not split that story into chapters.");

    const { data: book, error } = await supabaseAdmin
      .from("books")
      .insert({
        title: outline.title || data.title,
        blurb: outline.blurb ?? null,
        source_url: data.url,
        chapter_count: chapters.length,
        art_style: data.artStyle ?? DEFAULT_ART_STYLE,
        character_prompt: data.characterPrompt || null,
        status: "generating",
      })
      .select("id")
      .single();
    if (error || !book) throw new Error(error?.message ?? "Could not save the book.");

    const rows = chapters.map((c, i) => ({
      book_id: book.id,
      idx: i + 1,
      title: c.title || `Chapter ${i + 1}`,
      // Key beats are kept with the chapter so regeneration stays faithful.
      summary: [
        c.summary,
        `KEY: ${(c.keyEvents ?? []).join(" | ")}`,
        `SCENE: ${c.illustration ?? c.summary}`,
      ].join("\n"),
    }));

    const { error: chErr } = await supabaseAdmin.from("chapters").insert(rows);
    if (chErr) throw new Error(chErr.message);

    return { bookId: book.id as string, chapterCount: chapters.length };
  });

const ChapterInput = z.object({
  bookId: z.string().uuid(),
  idx: z.number().int().min(1).max(10),
});

export const generateChapter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ChapterInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildChapterContent, illustratePages, makeArt, getSourceText } = await import(
      "./story.server"
    );

    const { data: book } = await supabaseAdmin
      .from("books")
      .select("id, title, chapter_count, art_style, source_url, character_prompt")
      .eq("id", data.bookId)
      .single();
    if (!book) throw new Error("Book not found");

    const styleId = book.art_style ?? null;
    const characterPrompt = book.character_prompt ?? null;

    const { data: chapters } = await supabaseAdmin
      .from("chapters")
      .select("id, idx, title, summary, words, pages")
      .eq("book_id", data.bookId)
      .order("idx");
    const chapter = chapters?.find((c) => c.idx === data.idx);
    if (!chapter) throw new Error("Chapter not found");

    const known = (chapters ?? [])
      .filter((c) => c.idx < data.idx)
      .flatMap((c) => ((c.words ?? []) as { hanzi?: string }[]).map((w) => w.hanzi ?? ""))
      .filter(Boolean);

    const summary = chapter.summary ?? "";
    const [beforeScene, scenePart] = summary.split("SCENE:");
    const scene = (scenePart ?? beforeScene ?? chapter.title).trim();
    const [plot, keyPart] = (beforeScene ?? "").split("KEY:");
    const keyEvents = (keyPart ?? "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);

    // The original text keeps the retelling honest; it is cached per source link.
    let sourceExcerpt = "";
    if (book.source_url) {
      try {
        const full = await getSourceText(book.source_url);
        const total = book.chapter_count || 1;
        const size = Math.ceil(full.length / total);
        // Give this chapter its slice of the source, with a little overlap.
        const start = Math.max(0, (data.idx - 1) * size - 400);
        sourceExcerpt = full.slice(start, start + size + 800);
      } catch (err) {
        console.warn("Could not re-read source for fidelity", err);
      }
    }

    const content = await buildChapterContent(
      book.title,
      data.idx,
      chapter.title,
      (plot ?? "").trim() || chapter.title,
      known,
      keyEvents,
      sourceExcerpt,
    );


    // Paint every page (and the book cover on chapter 1) at the same time.
    const [pages, cover] = await Promise.all([
      illustratePages(
        data.bookId,
        data.idx,
        chapter.title,
        content.pages,
        styleId,
        characterPrompt,
      ),
      data.idx === 1
        ? makeArt(
            data.bookId,
            "cover",
            `Book cover scene for the children's story "${book.title}". ${scene}`,
            styleId,
            characterPrompt,
          ).catch((err) => {
            console.error("Cover failed", err);
            return null;
          })
        : Promise.resolve(null),
    ]);


    const imageUrl = pages.find((p) => p.image_url)?.image_url ?? null;

    const { error } = await supabaseAdmin
      .from("chapters")
      .update({ pages, words: content.words, image_url: imageUrl })
      .eq("id", chapter.id);
    if (error) throw new Error(error.message);

    if (cover) {
      await supabaseAdmin.from("books").update({ cover_url: cover }).eq("id", data.bookId);
    }

    if (data.idx >= (book.chapter_count ?? 0)) {
      await supabaseAdmin.from("books").update({ status: "ready" }).eq("id", data.bookId);
    }

    return { ok: true, idx: data.idx };
  });

const PreviewInput = z.object({
  title: z.string().trim().max(120).optional(),
  url: z.string().trim().url().max(2000),
});

export const previewBook = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PreviewInput.parse(input))
  .handler(async ({ data }) => {
    const { previewStory } = await import("./story.server");
    return previewStory(data.url, data.title ?? "");
  });
