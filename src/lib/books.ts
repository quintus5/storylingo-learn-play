import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BookRow, ChapterRow } from "./types";

export const booksQuery = queryOptions({
  queryKey: ["books"],
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
