import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Volume2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { bookQuery } from "@/lib/books";
import { useProgress } from "@/lib/progress";
import { speak } from "@/lib/audio";

export const Route = createFileRoute("/book/$bookId/vocab")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(bookQuery(params.bookId)),
  head: ({ loaderData }) => {
    const title = `${loaderData?.book.title ?? "Book"} — word list`;
    return {
      meta: [
        { title: `${title} — StoryLingo` },
        {
          name: "description",
          content: "Every Mandarin word from this picture book, with pinyin, Thai and audio.",
        },
        { property: "og:title", content: `${title} — StoryLingo` },
        {
          property: "og:description",
          content: "Every Mandarin word from this picture book, with pinyin, Thai and audio.",
        },
      ],
    };
  },
  component: VocabPage,
  errorComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">The word list could not be loaded.</p>
    </AppShell>
  ),
});

function VocabPage() {
  const { bookId } = Route.useParams();
  const { data } = useSuspenseQuery(bookQuery(bookId));
  const { progress } = useProgress();

  return (
    <AppShell title="Word list" back={{ to: "/book/$bookId", params: { bookId } }}>
      <div className="space-y-7">
        {data.chapters.map((chapter) => {
          const words = chapter.words ?? [];
          if (words.length === 0) return null;
          return (
            <section key={chapter.id}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-primary">
                Chapter {chapter.idx} · {chapter.title}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {words.map((word) => {
                  const mastered = progress.wordsMastered.includes(word.hanzi);
                  return (
                    <li
                      key={`${chapter.id}-${word.hanzi}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3"
                    >
                      <div className="min-w-0">
                        <p className="han text-2xl font-bold text-sand">{word.hanzi}</p>
                        <p className="text-xs text-primary">{word.pinyin}</p>
                        <p className="truncate text-sm text-muted-foreground">{word.dict}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {mastered && <span className="text-lg" aria-label="Mastered">⭐</span>}
                        <button
                          onClick={() => void speak(word.hanzi, true)}
                          aria-label={`Play ${word.hanzi}`}
                          className="press inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
                        >
                          <Volume2 className="h-5 w-5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
