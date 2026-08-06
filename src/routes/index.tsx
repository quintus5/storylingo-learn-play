import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BookOpen, Plus, Sparkles } from "lucide-react";
import { booksQuery } from "@/lib/books";
import { AppShell } from "@/components/AppShell";
import { useProgress } from "@/lib/progress";
import { CoinPurse } from "@/components/CoinPurse";
import { CharacterSprite } from "@/components/CharacterSprite";
import { useT } from "@/lib/i18n";

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

function Bookshelf() {
  const { data: books } = useSuspenseQuery(booksQuery);
  const { progress } = useProgress();
  const t = useT();

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
                      alt={t(
                        `Cover illustration for ${book.title}`,
                        `ภาพปกของ ${book.title}`,
                      )}
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
                    {t(`${stars}/${book.chapter_count} chapters done`, `ทำแล้ว ${stars}/${book.chapter_count} บท`)}
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
