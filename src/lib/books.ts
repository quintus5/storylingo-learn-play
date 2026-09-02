import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BookRow, ChapterRow } from "./types";

/**
 * Small copy of a cover, written beside the full picture when the book is
 * made. Older books are PNG and have no thumbnail, so they keep their own URL.
 */
export function coverThumb(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const [path, query] = url.split("?", 2);
  if (!path?.endsWith(".webp")) return url;
  return `${path.replace(/\.webp$/, "-thumb.webp")}${query ? `?${query}` : ""}`;
}

/**
 * The bookshelf is private-only for now: there is no reviewed public
 * catalogue yet, so a reader sees only the books they made themselves. Pass
 * the signed-in user's id, or null when nobody is signed in — the query then
 * resolves to an empty shelf without touching the network, since there is
 * nothing it could show.
 *
 * Row-level security would also let a `published` book through, and older
 * books made before this existed are still marked published — this filter is
 * the client-side choice to leave those off the shelf regardless, not a
 * change to what they're reachable at directly.
 */
export const booksQuery = (userId: string | null) =>
  queryOptions({
    queryKey: ["books", userId],
    queryFn: async (): Promise<BookRow[]> => {
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as BookRow[];
    },
  });

export const bookQuery = (bookId: string) =>
  queryOptions({
    queryKey: ["book", bookId],
    queryFn: async (): Promise<{ book: BookRow; chapters: ChapterRow[] }> => {
      const [{ data: book, error }, { data: chapters, error: chErr }] = await Promise.all([
        supabase.from("books").select("*").eq("id", bookId).maybeSingle(),
        supabase.from("chapters").select("*").eq("book_id", bookId).order("idx"),
      ]);
      if (error) throw new Error(error.message);
      if (chErr) throw new Error(chErr.message);
      if (!book) throw new Error("Book not found");
      return {
        book: book as unknown as BookRow,
        chapters: (chapters ?? []) as unknown as ChapterRow[],
      };
    },
  });
