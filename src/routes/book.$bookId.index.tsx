import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { BookOpen, ListChecks, Loader2, Lock, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StarRow } from "@/components/StarRow";
import { bookQuery } from "@/lib/books";
import { generateChapter, missingChapters } from "@/lib/story.functions";
import { isUnlocked, useProgress } from "@/lib/progress";
import { PRICES } from "@/lib/economy";
import { CoinPurse } from "@/components/CoinPurse";
import { useT } from "@/lib/i18n";


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
      <p className="text-muted-foreground">{useT()("This book could not be opened.", "ไม่สามารถเปิดหนังสือเล่มนี้ได้")}</p>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell back={{ to: "/" }}>
      <p className="text-muted-foreground">{useT()("This book does not exist.", "ไม่พบหนังสือเล่มนี้")}</p>
    </AppShell>
  ),
});

function BookPage() {
  const t = useT();
  const { bookId } = Route.useParams();
  const { data } = useSuspenseQuery(bookQuery(bookId));
  const { progress, buyChapter } = useProgress();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [wiggling, setWiggling] = useState<number | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [repairNote, setRepairNote] = useState<string | null>(null);

  const findMissing = useServerFn(missingChapters);
  const buildChapter = useServerFn(generateChapter);

  const { book, chapters } = data;
  const unfinished = chapters.filter((c) => !c.pages?.length).length;

  /** Retry only the chapters that never got written, a few at a time. */
  async function finishBook() {
    setRepairing(true);
    setRepairNote(null);
    try {
      const { idxs } = await findMissing({ data: { bookId } });
      for (let i = 0; i < idxs.length; i += 3) {
        const batch = idxs.slice(i, i + 3);
        setRepairNote(
          t(`Writing chapter ${batch.join(", ")}…`, `กำลังเขียนบทที่ ${batch.join(", ")}…`),
        );
        await Promise.all(batch.map((idx) => buildChapter({ data: { bookId, idx } })));
      }
      await queryClient.invalidateQueries({ queryKey: bookQuery(bookId).queryKey });
      setRepairNote(null);
    } catch (err) {
      setRepairNote(
        err instanceof Error
          ? err.message
          : t("That didn't work. Please try again.", "ยังไม่สำเร็จ ลองอีกครั้งนะ"),
      );
    } finally {
      setRepairing(false);
    }
  }

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
          <ListChecks className="h-4 w-4" /> {t("Parents", "ผู้ปกครอง")}
        </Link>
        </div>
      }
    >
      {unfinished > 0 && (
        <section className="mb-5 rounded-3xl border border-primary/30 bg-primary/10 p-4">
          <p className="font-bold">
            {t(
              `${unfinished} chapter${unfinished > 1 ? "s" : ""} didn't finish drawing.`,
              `มี ${unfinished} บทที่ยังวาดไม่เสร็จ`,
            )}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {repairNote ??
              t(
                "Tap to finish the missing chapters. It costs no extra coins.",
                "แตะเพื่อทำบทที่ขาดให้เสร็จ ไม่เสียเหรียญเพิ่ม",
              )}
          </p>
          <button
            type="button"
            onClick={() => void finishBook()}
            disabled={repairing}
            className="press mt-3 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {repairing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {t("Finishing…", "กำลังทำต่อ…")}
              </>
            ) : (
              t("Finish this book", "ทำหนังสือให้เสร็จ")
            )}
          </button>
        </section>
      )}


      <section className="mb-7 flex flex-col gap-4 rounded-3xl border border-primary/20 bg-card/70 p-4 sm:flex-row">
        <div className="h-44 w-32 shrink-0 overflow-hidden rounded-2xl bg-secondary">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt={t(`Cover illustration for ${book.title}`, `ภาพปกของ ${book.title}`)}
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
            <Sparkles className="h-4 w-4" /> {t("Word list", "คลังคำศัพท์")}
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
                      alt={t(`Illustration for ${chapter.title}`, `ภาพประกอบของ ${chapter.title}`)}
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
                    {t(`Chapter ${chapter.idx}`, `บทที่ ${chapter.idx}`)}
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
                    {t("Open now", "เปิดเลย")} · 🪙 {PRICES.chapter}
                  </button>
                  <p className="mt-1 text-center text-[11px] text-muted-foreground">
                    {t(`or earn a star in chapter ${chapter.idx - 1}`, `หรือรับดาวจากบทที่ ${chapter.idx - 1}`)}
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
