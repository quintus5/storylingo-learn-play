import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ART_STYLES, DEFAULT_ART_STYLE } from "./art-styles";
import { parseBibleEntries } from "./story-schema";


const ART_STYLE_IDS = ART_STYLES.map((s) => s.id) as [string, ...string[]];

const CreateBookInput = z.object({
  title: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(2000),
  chapterCount: z.number().int().min(1).max(10),
  artStyle: z.enum(ART_STYLE_IDS).optional(),
  /** Description of the reader's own character, painted into every picture. */
  characterPrompt: z.string().trim().max(600).optional(),
});

/** Books anyone may start in one hour, so a script cannot drain AI credits. */
const HOURLY_BOOK_LIMIT = 12;

export const createBook = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateBookInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getSourceText, buildOutline, buildStoryBible } = await import("./story.server");

    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabaseAdmin
      .from("books")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    if ((count ?? 0) >= HOURLY_BOOK_LIMIT) {
      throw new Error("StoryLingo is making a lot of books right now. Please try again in a while.");
    }

    const storyText = await getSourceText(data.url);
    // The bible is written once here and reused by every picture in this book.
    const [outline, bible] = await Promise.all([
      buildOutline(storyText, data.title, data.chapterCount),
      buildStoryBible(storyText),
    ]);

    const chapters = (outline.chapters ?? []).slice(0, data.chapterCount);
    if (chapters.length < 1) throw new Error("Could not split that story into chapters.");


    const { data: book, error } = await supabaseAdmin
      .from("books")
      .insert({
        title: outline.title || data.title,
        title_th: outline.title_th ?? null,
        blurb: outline.blurb ?? null,
        blurb_th: outline.blurb_th ?? null,
        source_url: data.url,
        chapter_count: chapters.length,
        art_style: data.artStyle ?? DEFAULT_ART_STYLE,
        character_prompt: data.characterPrompt || null,
        cast_bible: bible.cast,
        places: bible.places,
        status: "generating",
      })
      .select("id")
      .single();
    if (error || !book) throw new Error(error?.message ?? "Could not save the book.");


    const rows = chapters.map((c, i) => ({
      book_id: book.id,
      idx: i + 1,
      title: c.title || `Chapter ${i + 1}`,
      title_th: c.title_th ?? null,
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
      .select("id, title, chapter_count, art_style, source_url, character_prompt, cast_bible, places")
      .eq("id", data.bookId)
      .single();
    if (!book) throw new Error("Book not found");

    const styleId = book.art_style ?? null;
    const characterPrompt = book.character_prompt ?? null;
    // Written once when the book was created; reused by every picture here.
    const bible = {
      cast: parseBibleEntries(book.cast_bible, 12),
      places: parseBibleEntries(book.places, 8),
    };


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
      bible,
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
        bible,
      ),
      data.idx === 1
        ? makeArt(
            data.bookId,
            "cover",
            `Book cover scene for the children's story "${book.title}". ${scene}`,
            styleId,
            characterPrompt,
            [...bible.cast.slice(0, 3), ...bible.places.slice(0, 1)],
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

    // Chapters are written in parallel batches, so "done" means every chapter
    // actually has pages — not just that the last index finished.
    const { data: after } = await supabaseAdmin
      .from("chapters")
      .select("idx, pages")
      .eq("book_id", data.bookId);
    const missing = (after ?? []).filter((c) => ((c.pages ?? []) as unknown[]).length === 0);
    if (missing.length === 0) {
      await supabaseAdmin
        .from("books")
        .update({ status: "ready", generation_error: null })
        .eq("id", data.bookId);
    }

    return { ok: true, idx: data.idx };
  });

const FailInput = z.object({
  bookId: z.string().uuid(),
  message: z.string().trim().max(300).optional(),
});

/** Flag a half-built book so it stops looking like it is still working. */
export const markBookFailed = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => FailInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: book } = await supabaseAdmin
      .from("books")
      .select("status")
      .eq("id", data.bookId)
      .single();
    if (!book || book.status === "ready") return { ok: false };
    await supabaseAdmin
      .from("books")
      .update({ status: "failed", generation_error: data.message ?? null })
      .eq("id", data.bookId);
    return { ok: true };
  });

/** Which chapters of a book still have no pages, so they can be retried. */
export const missingChapters = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ bookId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("chapters")
      .select("idx, pages")
      .eq("book_id", data.bookId)
      .order("idx");
    const idxs = (rows ?? [])
      .filter((c) => ((c.pages ?? []) as unknown[]).length === 0)
      .map((c) => c.idx as number);
    if (idxs.length > 0) {
      await supabaseAdmin
        .from("books")
        .update({ status: "generating", generation_error: null })
        .eq("id", data.bookId);
    }
    return { idxs };
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

const DeleteBookInput = z.object({ bookId: z.string().uuid() });

/** Developer-only cleanup: removes a book and everything under it. */
export const deleteBook = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteBookInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("chapters").delete().eq("book_id", data.bookId);
    const { error } = await supabaseAdmin.from("books").delete().eq("id", data.bookId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Developer-only: write the book's visual bible (if it has none) and repaint
 * every page with it, so an older, inconsistent book becomes consistent.
 * The story text is untouched.
 */
export const repaintBook = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DeleteBookInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getSourceText, buildStoryBible, illustratePages, makeArt } = await import(
      "./story.server"
    );

    const { data: book } = await supabaseAdmin
      .from("books")
      .select("id, title, art_style, source_url, character_prompt, cast_bible, places")
      .eq("id", data.bookId)
      .single();
    if (!book) throw new Error("Book not found");

    let bible = {
      cast: parseBibleEntries(book.cast_bible, 12),
      places: parseBibleEntries(book.places, 8),
    };
    if (!bible.cast.length && book.source_url) {
      const storyText = await getSourceText(book.source_url);
      bible = await buildStoryBible(storyText);
      await supabaseAdmin
        .from("books")
        .update({ cast_bible: bible.cast, places: bible.places })
        .eq("id", data.bookId);
    }

    const { data: chapters } = await supabaseAdmin
      .from("chapters")
      .select("id, idx, title, pages")
      .eq("book_id", data.bookId)
      .order("idx");

    for (const chapter of chapters ?? []) {
      const pages = ((chapter.pages ?? []) as Page[]).filter((p) => p?.sentences?.length);
      if (!pages.length) continue;
      const painted = await illustratePages(
        data.bookId,
        chapter.idx as number,
        chapter.title as string,
        pages,
        book.art_style ?? null,
        book.character_prompt ?? null,
        bible,
      );
      await supabaseAdmin
        .from("chapters")
        .update({ pages: painted, image_url: painted.find((p) => p.image_url)?.image_url ?? null })
        .eq("id", chapter.id);
    }

    const cover = await makeArt(
      data.bookId,
      "cover",
      `Book cover scene for the children's story "${book.title}".`,
      book.art_style ?? null,
      book.character_prompt ?? null,
      [...bible.cast.slice(0, 3), ...bible.places.slice(0, 1)],
    ).catch(() => null);
    if (cover) {
      // Bust the browser cache for the replaced cover image.
      await supabaseAdmin
        .from("books")
        .update({ cover_url: `${cover}?v=${Date.now()}` })
        .eq("id", data.bookId);
    }

    return { ok: true, chapters: (chapters ?? []).length };
  });

