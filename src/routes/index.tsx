import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BookOpen, Plus, Sparkles } from "lucide-react";
import { booksQuery } from "@/lib/books";
import { AppShell } from "@/components/AppShell";
import { useProgress } from "@/lib/progress";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StoryLingo — Your Mandarin bookshelf" },
      {
        name: "description",
        content:
          "A night-desert bookshelf of illustrated Mandarin picture books made from your favourite children's stories.",
      },
      { property: "og:title", content: "StoryLingo — Your Mandarin bookshelf" },
      {
        property: "og:description",
        content: "A night-desert bookshelf of illustrated Mandarin picture books made from your favourite children's stories.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(booksQuery),
  component: Bookshelf,
  errorComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">The bookshelf could not be loaded. Please refresh.</p>
    </AppShell>
  ),
});

function Bookshelf() {
  const { data: books } = useSuspenseQuery(booksQuery);
  const { progress } = useProgress();

  return (
    <AppShell
      title="StoryLingo"
      right={
        <Link
          to="/create"
          className="press inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> New story
        </Link>
      }
    >
      <section className="mb-8 rounded-3xl border border-primary/20 bg-card/70 p-6">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary">
          <Sparkles className="h-4 w-4" /> Mandarin for Thai speakers
        </p>
        <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">
          Every story becomes a picture book you can read out loud.
        </h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Paste a story link and StoryLingo retells it in beginner Mandarin, paints watercolor
          scenes, reads every word aloud and quizzes you chapter by chapter.
        </p>
      </section>

      {books.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center">
          <p className="text-lg font-bold">Your bookshelf is empty</p>
          <p className="mt-1 text-muted-foreground">Add your first story to get started.</p>
          <Link
            to="/create"
            className="press mt-5 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 font-bold text-primary-foreground"
          >
            <Plus className="h-5 w-5" /> Create a book
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {books.map((book) => {
            const stars = Object.values(progress.books[book.id]?.stars ?? {}).length;
            return (
              <Link
                key={book.id}
                to="/book/$bookId"
                params={{ bookId: book.id }}
                className="press group overflow-hidden rounded-3xl border border-border bg-card shadow-[0_18px_40px_-18px_oklch(0_0_0/0.75)]"
              >
                <div className="aspect-[3/4] w-full overflow-hidden bg-secondary">
                  {book.cover_url ? (
                    <img
                      src={book.cover_url}
                      alt={`Cover illustration for ${book.title}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <BookOpen className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 font-bold leading-snug">{book.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {stars}/{book.chapter_count} chapters done
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
