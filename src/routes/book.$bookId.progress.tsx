import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { StarRow } from "@/components/StarRow";
import { bookQuery } from "@/lib/books";
import { useProgress } from "@/lib/progress";

export const Route = createFileRoute("/book/$bookId/progress")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(bookQuery(params.bookId)),
  head: () => ({
    meta: [
      { title: "Progress — StoryLingo" },
      {
        name: "description",
        content: "See stars, streaks, mastered words and tricky words for this picture book.",
      },
      { property: "og:title", content: "Progress — StoryLingo" },
      {
        property: "og:description",
        content: "Stars, streaks and tricky words for young Mandarin readers.",
      },
    ],
  }),
  component: ProgressPage,
  errorComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">Progress could not be loaded.</p>
    </AppShell>
  ),
});

function ProgressPage() {
  const { bookId } = Route.useParams();
  const { data } = useSuspenseQuery(bookQuery(bookId));
  const { progress } = useProgress();

  const book = progress.books[bookId] ?? { stars: {}, read: {} };
  const totalStars = Object.values(book.stars).reduce((a, b) => a + b, 0);
  const tricky = Object.entries(progress.wordsMissed)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  return (
    <AppShell title="Progress" back={{ to: "/book/$bookId", params: { bookId } }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Stars earned" value={`${totalStars} / ${data.chapters.length * 3}`} />
        <Stat label="Day streak" value={`${progress.streak} 🔥`} />
        <Stat label="Words mastered" value={`${progress.wordsMastered.length}`} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-widest text-primary">
        Chapters
      </h2>
      <ul className="space-y-2">
        {data.chapters.map((chapter) => (
          <li
            key={chapter.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-bold">
                {chapter.idx}. {chapter.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {book.read[chapter.idx] ? "Read" : "Not read yet"}
              </p>
            </div>
            <StarRow count={book.stars[chapter.idx] ?? 0} size={16} />
          </li>
        ))}
      </ul>

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-widest text-primary">
        Words to practise
      </h2>
      {tricky.length === 0 ? (
        <p className="text-muted-foreground">No tricky words yet — great work!</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {tricky.map(([hanzi, count]) => (
            <li
              key={hanzi}
              className="han rounded-2xl border border-border bg-card px-3 py-2 text-lg font-bold text-sand"
            >
              {hanzi}
              <span className="ml-2 text-xs font-normal text-muted-foreground">×{count}</span>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-primary/20 bg-card p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
    </div>
  );
}
