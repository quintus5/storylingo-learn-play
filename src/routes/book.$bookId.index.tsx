import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpen, ListChecks, Lock, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StarRow } from "@/components/StarRow";
import { bookQuery } from "@/lib/books";
import { isUnlocked, useProgress } from "@/lib/progress";
import { PRICES } from "@/lib/economy";
import { CoinPurse } from "@/components/CoinPurse";

export const Route = createFileRoute("/book/$bookId/")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(bookQuery(params.bookId)),
  head: ({ loaderData }) => {
    const title = loaderData?.book.title ?? "Picture book";
    const description =
      loaderData?.book.blurb ?? "An illustrated beginner Mandarin picture book on StoryLingo.";
    return {
      meta: [
        { title: `${title} — StoryLingo` },
        { name: "description", content: description },
        { property: "og:title", content: `${title} — StoryLingo` },
        { property: "og:description", content: description },
      ],
    };
  },
  component: BookPage,
  errorComponent: () => (
    <AppShell back={{ to: "/" }}>
      <p className="text-muted-foreground">This book could not be opened.</p>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell back={{ to: "/" }}>
      <p className="text-muted-foreground">This book does not exist.</p>
    </AppShell>
  ),
});

function BookPage() {
  const { bookId } = Route.useParams();
  const { data } = useSuspenseQuery(bookQuery(bookId));
  const { progress, buyChapter } = useProgress();
  const navigate = useNavigate();
  const [wiggling, setWiggling] = useState<number | null>(null);

  const { book, chapters } = data;

  return (
    <AppShell
      title={book.title}
      back={{ to: "/" }}
      right={
        <div className="flex items-center gap-2">
        <CoinPurse coins={progress.coins} />
        <Link
          to="/book/$bookId/progress"
          params={{ bookId }}
          className="press inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-2 text-xs font-bold text-secondary-foreground"
        >
          <ListChecks className="h-4 w-4" /> Parents
        </Link>
        </div>
      }
    >
      <section className="mb-7 flex flex-col gap-4 rounded-3xl border border-primary/20 bg-card/70 p-4 sm:flex-row">
        <div className="h-44 w-32 shrink-0 overflow-hidden rounded-2xl bg-secondary">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt={`Cover illustration for ${book.title}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <BookOpen className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold">{book.title}</h2>
          {book.blurb && <p className="mt-1 text-muted-foreground">{book.blurb}</p>}
          <Link
            to="/book/$bookId/vocab"
            params={{ bookId }}
            className="press mt-4 inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground"
          >
            <Sparkles className="h-4 w-4" /> Word list
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {chapters.map((chapter) => {
          const unlocked = isUnlocked(progress, bookId, chapter.idx);
          const stars = progress.books[bookId]?.stars[chapter.idx] ?? 0;
          const empty = !chapter.pages?.length;

          return (
            <div
              key={chapter.id}
              className={`overflow-hidden rounded-3xl border text-left ${
                unlocked && !empty
                  ? "border-border bg-card"
                  : "border-border/50 bg-card/50 opacity-70"
              } ${wiggling === chapter.idx ? "animate-[wiggle_0.5s_ease-in-out]" : ""}`}
            >
              <button
                type="button"
                className="press block w-full text-left"
                onClick={() => {
                  if (unlocked && !empty) {
                    void navigate({
                      to: "/book/$bookId/chapter/$n",
                      params: { bookId, n: String(chapter.idx) },
                    });
                  } else {
                    setWiggling(chapter.idx);
                    setTimeout(() => setWiggling(null), 520);
                  }
                }}
              >
                <div className="relative aspect-[4/3] w-full bg-secondary">
                  {chapter.image_url ? (
                    <img
                      src={chapter.image_url}
                      alt={`Illustration for ${chapter.title}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <BookOpen className="h-7 w-7" />
                    </div>
                  )}
                  {(!unlocked || empty) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/65">
                      <Lock className="h-7 w-7 text-primary" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">
                    Chapter {chapter.idx}
                  </p>
                  <p className="line-clamp-2 font-bold leading-snug">{chapter.title}</p>
                  <div className="mt-2">
                    <StarRow count={stars} size={15} />
                  </div>
                </div>
              </button>

              {!unlocked && !empty && (
                <div className="px-3 pb-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!buyChapter(bookId, chapter.idx)) {
                        setWiggling(chapter.idx);
                        setTimeout(() => setWiggling(null), 520);
                      }
                    }}
                    className="press w-full rounded-2xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
                  >
                    Open now · 🪙 {PRICES.chapter}
                  </button>
                  <p className="mt-1 text-center text-[11px] text-muted-foreground">
                    or earn a star in chapter {chapter.idx - 1}
                  </p>
                </div>
              )}
            </div>
          );

        })}
      </div>
    </AppShell>
  );
}
