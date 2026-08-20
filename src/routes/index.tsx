import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Paintbrush, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { booksQuery, coverThumb } from "@/lib/books";
import { deleteBook, repaintBook } from "@/lib/story.functions";
import { AppShell } from "@/components/AppShell";
import { SignInPanel } from "@/components/SignInPanel";
import { useAuth } from "@/lib/auth";
import { useProgress } from "@/lib/progress";
import { CoinPurse } from "@/components/CoinPurse";
import { CharacterSprite } from "@/components/CharacterSprite";
import { useDevMode } from "@/lib/dev-mode";
import { AUTHORING_ENABLED } from "@/lib/authoring";
import { useLocalText, useT } from "@/lib/i18n";
import { AccountButton } from "@/components/SignInPanel";


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
  // No loader here any more: which books to show depends on who is signed
  // in, and that is only known client-side (the Supabase session lives in
  // localStorage), so there is nothing useful to prefetch server-side.
  component: BookshelfRoute,
  errorComponent: () => (
    <AppShell>
      <ErrorMessage />
    </AppShell>
  ),
});

function ErrorMessage() {
  const t = useT();
  return (
    <p className="text-muted-foreground">
      {t("The bookshelf could not be loaded. Please refresh.", "ไม่สามารถโหลดชั้นหนังสือได้ กรุณาลองรีเฟรชอีกครั้ง")}
    </p>
  );
}

/**
 * There is no reviewed public catalogue yet, so there is nothing for a
 * signed-out visitor to browse — the shelf can only ever show books someone
 * made themselves. Sign in first, same as making a new book already asks for.
 */
function BookshelfRoute() {
  const t = useT();
  const { user, loaded, isGuest } = useAuth();
  if (!loaded) return <AppShell title={t("StoryLingo", "StoryLingo")}>{null}</AppShell>;
  if (!user) {
    return (
      <AppShell title={t("StoryLingo", "StoryLingo")}>
        <SignInPanel
          title={t("Welcome to StoryLingo", "ยินดีต้อนรับสู่ StoryLingo")}
          reason={t(
            "Sign in to keep your own bookshelf — the books you make are yours.",
            "เข้าสู่ระบบเพื่อเก็บชั้นหนังสือของคุณเอง — หนังสือที่คุณสร้างจะเป็นของคุณ",
          )}
        />
      </AppShell>
    );
  }
  return <Bookshelf userId={isGuest ? null : user.id} />;
}

function Bookshelf({ userId }: { userId: string | null }) {
  const { data: books } = useSuspenseQuery(booksQuery(userId));
  const { progress } = useProgress();
  // Operator controls need both the build flag and the hidden dev toggle.
  const dev = useDevMode() && AUTHORING_ENABLED;
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<string | null>(null);
  const [repainting, setRepainting] = useState<string | null>(null);
  const [brokenCovers, setBrokenCovers] = useState<Record<string, true>>({});
  const [fullCoverFallbacks, setFullCoverFallbacks] = useState<Record<string, true>>({});

  const t = useT();
  const local = useLocalText();

  async function removeBook(bookId: string, title: string) {
    if (!window.confirm(t(`Delete "${title}"? This cannot be undone.`, `ลบ "${title}" ใช่ไหม ลบแล้วกู้คืนไม่ได้`))) return;
    setRemoving(bookId);
    try {
      await deleteBook({ data: { bookId } });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
    } finally {
      setRemoving(null);
    }
  }

  async function repaint(bookId: string, title: string) {
    if (
      !window.confirm(
        t(
          `Repaint every picture in "${title}" so the characters stay the same? This takes a few minutes.`,
          `วาดภาพใหม่ทั้งเล่มของ "${title}" เพื่อให้ตัวละครเหมือนกันทุกบท? ใช้เวลาสักครู่`,
        ),
      )
    )
      return;
    setRepainting(bookId);
    try {
      await repaintBook({ data: { bookId } });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
    } finally {
      setRepainting(null);
    }
  }




  return (
    <AppShell
      title={t("StoryLingo", "StoryLingo")}
      right={
        <div className="flex items-center gap-2">
          <CoinPurse coins={progress.coins} />
          <Link
            to="/create"
            className="press inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> {t("New story", "สร้างนิทานใหม่")}
          </Link>
          <AccountButton />
        </div>
      }
    >
      <section className="mb-8 rounded-3xl border border-primary/20 bg-card/70 p-6">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary">
          <Sparkles className="h-4 w-4" /> {t("Mandarin for Thai speakers", "ภาษาจีนกลางสำหรับเด็กไทย")}
        </p>
        <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">
          {t(
            "Every story becomes a picture book you can read out loud.",
            "ทุกนิทานจะกลายเป็นหนังสือภาพที่อ่านออกเสียงได้",
          )}
        </h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {t(
            "Paste a story link and StoryLingo retells it in beginner Mandarin, paints watercolor scenes, reads every word aloud and quizzes you chapter by chapter.",
            "แปะลิงก์นิทาน แล้ว StoryLingo จะแต่งใหม่เป็นภาษาจีนกลางระดับเริ่มต้น วาดภาพสีน้ำสวยๆ อ่านออกเสียงทุกคำ และมีแบบทดสอบทีละบท",
          )}
        </p>
      </section>

      <section className="mb-8 flex items-center gap-4 rounded-3xl border border-border bg-card/70 p-4">
        {progress.character ? (
          <CharacterSprite look={progress.character} size={64} variant="bust" />
        ) : (
          <span className="text-4xl" aria-hidden>
            🧒
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">
            {progress.character
              ? progress.character.name || t("Your story buddy", "เพื่อนคู่นิทานของเธอ")
              : t("Make your story buddy", "สร้างเพื่อนคู่นิทานของเธอ")}
          </p>
          <p className="text-sm text-muted-foreground">
            {progress.character
              ? t(
                  "They join the pictures in every new book you make.",
                  "เพื่อนคนนี้จะไปโผล่ในภาพของทุกเล่มใหม่ที่เธอสร้าง",
                )
              : t(
                  "Design a character who appears inside your picture books.",
                  "ออกแบบตัวละครที่จะไปปรากฏในหนังสือภาพของเธอ",
                )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Link
            to="/character"
            className="press rounded-2xl bg-secondary px-4 py-2 text-center text-sm font-bold text-secondary-foreground"
          >
            {progress.character ? t("Edit", "แก้ไข") : t("Create", "สร้าง")}
          </Link>
          <Link
            to="/shop"
            className="press rounded-2xl bg-secondary px-4 py-2 text-center text-sm font-bold text-secondary-foreground"
          >
            {t("Shop", "ร้านค้า")}
          </Link>
        </div>
      </section>

      {books.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center">
          <p className="text-lg font-bold">{t("Your bookshelf is empty", "ชั้นหนังสือของเธอยังว่างอยู่")}</p>
          <p className="mt-1 text-muted-foreground">
            {t("Add your first story to get started.", "เพิ่มนิทานเรื่องแรกเพื่อเริ่มต้นกันเลย")}
          </p>
          <Link
            to="/create"
            className="press mt-5 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 font-bold text-primary-foreground"
          >
            <Plus className="h-5 w-5" /> {t("Create a book", "สร้างหนังสือ")}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {books.map((book) => {
            // Only chapters that actually earned a star count as done — a
            // failed quiz still writes a 0 into the stars map.
            const stars = Object.values(progress.books[book.id]?.stars ?? {}).filter(
              (s) => s > 0,
            ).length;
            return (
              <div key={book.id} className="relative h-full">
              {dev && (
                <>
                <button
                  onClick={() => void removeBook(book.id, book.title)}
                  disabled={removing === book.id}
                  aria-label={`Delete ${book.title}`}
                  className="press absolute -right-2 -top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-lg disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
                <button
                  onClick={() => void repaint(book.id, book.title)}
                  disabled={repainting === book.id}
                  aria-label={`Repaint pictures for ${book.title}`}
                  title="Repaint pictures"
                  className="press absolute -left-2 -top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-secondary text-secondary-foreground shadow-lg disabled:opacity-50"
                >
                  <Paintbrush className={`h-4 w-4 ${repainting === book.id ? "animate-pulse" : ""}`} />
                </button>
                </>
              )}

              <Link
                to="/book/$bookId"
                params={{ bookId: book.id }}
                className="press group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[0_18px_40px_-18px_oklch(0_0_0/0.75)]"
              >

                <div className="aspect-[3/4] w-full shrink-0 overflow-hidden bg-secondary">
                  {book.cover_url && !brokenCovers[book.id] ? (
                    <img
                      src={fullCoverFallbacks[book.id] ? book.cover_url : coverThumb(book.cover_url)}
                      alt={t(
                        `Cover illustration for ${book.title}`,
                        `ภาพปกของ ${book.title}`,
                      )}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      width={480}
                      height={640}
                      onError={() => {
                        if (!fullCoverFallbacks[book.id] && coverThumb(book.cover_url) !== book.cover_url) {
                          setFullCoverFallbacks((prev) => ({ ...prev, [book.id]: true }));
                          return;
                        }
                        setBrokenCovers((prev) => ({ ...prev, [book.id]: true }));
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <BookOpen className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <p className="line-clamp-2 min-h-[2.75em] font-bold leading-snug">{local(book.title, book.title_th)}</p>
                  <p className="mt-auto pt-1 text-xs text-muted-foreground">
                    {t(`${stars}/${book.chapter_count} chapters done`, `ทำแล้ว ${stars}/${book.chapter_count} บท`)}
                  </p>
                </div>
              </Link>
              </div>

            );

          })}
        </div>
      )}
    </AppShell>
  );
}
