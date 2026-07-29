import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CreateBookInput = z.object({
  title: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(2000),
  chapterCount: z.number().int().min(1).max(10),
});

export const createBook = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateBookInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchStoryText, buildOutline } = await import("./story.server");

    const storyText = await fetchStoryText(data.url);
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
        status: "generating",
      })
      .select("id")
      .single();
    if (error || !book) throw new Error(error?.message ?? "Could not save the book.");

    const rows = chapters.map((c, i) => ({
      book_id: book.id,
      idx: i + 1,
      title: c.title || `Chapter ${i + 1}`,
      summary: [c.summary, `SCENE: ${c.illustration ?? c.summary}`].join("\n"),
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
    const { buildChapterContent, makeArt } = await import("./story.server");

    const { data: book } = await supabaseAdmin
      .from("books")
      .select("id, title, chapter_count")
      .eq("id", data.bookId)
      .single();
    if (!book) throw new Error("Book not found");

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
    const [plot, scenePart] = summary.split("SCENE:");
    const scene = (scenePart ?? plot ?? chapter.title).trim();

    const content = await buildChapterContent(
      book.title,
      data.idx,
      chapter.title,
      (plot ?? "").trim() || chapter.title,
      known,
    );

    let imageUrl: string | null = null;
    try {
      imageUrl = await makeArt(data.bookId, `chapter-${data.idx}`, scene);
    } catch (err) {
      console.error("Illustration failed", err);
    }

    const { error } = await supabaseAdmin
      .from("chapters")
      .update({ pages: content.pages, words: content.words, image_url: imageUrl })
      .eq("id", chapter.id);
    if (error) throw new Error(error.message);

    if (data.idx === 1) {
      try {
        const cover = await makeArt(
          data.bookId,
          "cover",
          `Book cover scene for the children's story "${book.title}". ${scene}`,
        );
        await supabaseAdmin.from("books").update({ cover_url: cover }).eq("id", data.bookId);
      } catch (err) {
        console.error("Cover failed", err);
      }
    }

    if (data.idx >= (book.chapter_count ?? 0)) {
      await supabaseAdmin.from("books").update({ status: "ready" }).eq("id", data.bookId);
    }

    return { ok: true, idx: data.idx };
  });
