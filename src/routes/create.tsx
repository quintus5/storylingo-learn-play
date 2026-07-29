import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { BookOpen, Loader2, Search, Wand2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { createBook, generateChapter, previewBook } from "@/lib/story.functions";

type StoryPreview = {
  title: string;
  blurb: string;
  suggestedChapters: number;
  reason: string;
  chapterTitles: string[];
  wordCount: number;
};



export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create a story — StoryLingo" },
      {
        name: "description",
        content:
          "Paste a children's story link and StoryLingo builds an illustrated beginner Mandarin picture book from it.",
      },
      { property: "og:title", content: "Create a story — StoryLingo" },
      {
        property: "og:description",
        content: "Turn any story link into an illustrated Mandarin learning book.",
      },
    ],
  }),
  component: CreatePage,
});

function CreatePage() {
  const navigate = useNavigate();
  const create = useServerFn(createBook);
  const chapter = useServerFn(generateChapter);
  const preview = useServerFn(previewBook);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [chapterCount, setChapterCount] = useState(8);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [plan, setPlan] = useState<StoryPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const say = (line: string) => setLog((l) => [...l, line]);

  async function onFetch() {
    setError(null);
    setPlan(null);
    setFetching(true);
    try {
      const result = await preview({ data: { title: title.trim(), url: url.trim() } });
      setPlan(result);
      setChapterCount(result.suggestedChapters);
      if (!title.trim()) setTitle(result.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that link.");
    } finally {
      setFetching(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLog([]);
    setBusy(true);
    try {

      say("Reading the story…");
      const { bookId, chapterCount: count } = await create({
        data: { title: title.trim() || "A new story", url: url.trim(), chapterCount },
      });
      say(`Retelling it as ${count} chapters…`);
      // Chapters are built a few at a time so the whole book finishes much faster.
      const BATCH = 3;
      for (let start = 1; start <= count; start += BATCH) {
        const batch = Array.from(
          { length: Math.min(BATCH, count - start + 1) },
          (_, k) => start + k,
        );
        say(
          batch.length === 1
            ? `Writing chapter ${batch[0]} and painting its pictures…`
            : `Writing chapters ${batch[0]}–${batch[batch.length - 1]} and painting their pictures…`,
        );
        await Promise.all(batch.map((i) => chapter({ data: { bookId, idx: i } })));
      }
      say("Your book is ready!");
      await navigate({ to: "/book/$bookId", params: { bookId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="New story" back={{ to: "/" }}>
      <form onSubmit={onSubmit} className="mx-auto max-w-xl space-y-5">
        <div className="rounded-3xl border border-border bg-card p-5">
          <label className="block text-sm font-semibold" htmlFor="title">
            Story title
          </label>
          <input
            id="title"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="The Little Star Who Lost Her Light"
            className="mt-2 w-full rounded-2xl border border-input bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
          />

          <label className="mt-5 block text-sm font-semibold" htmlFor="url">
            Story link
          </label>
          <input
            id="url"
            required
            type="url"
            value={url}
            maxLength={2000}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/a-bedtime-story"
            className="mt-2 w-full rounded-2xl border border-input bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            StoryLingo writes its own retelling of the story, so nothing is copied word for word.
          </p>

          <button
            type="button"
            onClick={() => void onFetch()}
            disabled={fetching || busy || !url.trim()}
            className="press mt-4 inline-flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground disabled:opacity-60"
          >
            {fetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {fetching ? "Reading the story…" : "Fetch book"}
          </button>

          <label className="mt-5 block text-sm font-semibold" htmlFor="chapters">
            {chapterCount === 1 ? "1 chapter (quick mini-book)" : `${chapterCount} chapters`}
            {plan && chapterCount === plan.suggestedChapters && (
              <span className="ml-2 font-normal text-primary">· suggested</span>
            )}
          </label>
          <input
            id="chapters"
            type="range"
            min={1}
            max={10}
            step={1}
            value={chapterCount}
            onChange={(e) => setChapterCount(Number(e.target.value))}
            className="mt-3 w-full accent-[var(--gold)]"
          />


          <div className="mt-5 rounded-2xl bg-secondary/50 p-3 text-sm text-muted-foreground">
            Learning Mandarin Chinese (with pinyin) · explained in Thai
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="press inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-lg font-extrabold text-primary-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
          {busy ? "Building your book…" : "Make my picture book"}
        </button>

        {log.length > 0 && (
          <ul className="space-y-1 rounded-2xl border border-border bg-card/70 p-4 text-sm">
            {log.map((line, i) => (
              <li key={i} className="text-muted-foreground">
                {i === log.length - 1 && busy ? "→ " : "✓ "}
                {line}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            {error}
          </p>
        )}
      </form>
    </AppShell>
  );
}
