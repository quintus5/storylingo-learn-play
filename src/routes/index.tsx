import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Paintbrush, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { booksQuery, coverThumb } from "@/lib/books";
import { deleteBook, repaintBook } from "@/lib/story.functions";
import { AppShell } from "@/components/AppShell";
import { useProgress } from "@/lib/progress";
import { CoinPurse } from "@/components/CoinPurse";
import { CharacterSprite } from "@/components/CharacterSprite";
import { useDevMode } from "@/lib/dev-mode";
import { AUTHORING_ENABLED } from "@/lib/authoring";
import { readAdminToken, saveAdminToken } from "@/lib/admin-middleware";
import { useLocalText, useT } from "@/lib/i18n";


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
  return <Bookshelf userId={null} />;
}

function Bookshelf({ userId }: { userId: string | null }) {
  const { data: books } = useSuspenseQuery(booksQuery(userId));
  const { progress } = useProgress();
  // Operator controls need both the build flag and the hidden dev toggle.
  const dev = useDevMode() && AUTHORING_ENABLED;
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<string | null>(null);
const [repainting, setRepainting] = useState<string | null>(null);
  // Operator token: entered once in dev mode, kept in sessionStorage, sent
  // as x-storylingo-admin on every repaint/delete call.
  const [tokenDraft, setTokenDraft] = useState("");
  const [tokenSet, setTokenSet] = useState(false);
  useEffect(() => {
    setTokenSet(Boolean(readAdminToken()));
  }, []);
  const [brokenCovers, setBrokenCovers] = useState<Record<string, true>>({});
  const [fullCoverFallbacks, setFullCoverFallbacks] = useState<Record<string, true>>({});

  const t = useT();
  const local = useLocalText();

const [opError, setOpError] = useState<string | null>(null);

  async function removeBook(bookId: string, title: string) {
    if (!window.confirm(t(`Delete "${title}"? This cannot be undone.`, `ลบ "${title}" ใช่ไหม ลบแล้วกู้คืนไม่ได้`))) return;
    setRemoving(bookId);
    setOpError(null);
    try {
      await deleteBook({ data: { bookId } });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
    } catch (err) {
      setOpError(err instanceof Error ? err.message : String(err));
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
    setOpError(null);
    try {
      await repaintBook({ data: { bookId } });
      await queryClient.invalidateQueries({ queryKey: ["books"] });
    } catch (err) {
      setOpError(err instanceof Error ? err.message : String(err));
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

      {dev && (
        <section className="mb-6 rounded-2xl border border-amber-400/50 bg-amber-400/10 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold text-amber-500">
              {t("Developer mode", "โหมดผู้พัฒนา")}
            </span>
            <span
              className={`h-2 w-2 rounded-full ${tokenSet ? "bg-emerald-400" : "bg-amber-500"}`}
              aria-hidden
            />
            <span className="text-muted-foreground">
              {tokenSet
                ? t(
                    "Operator token saved — Repaint and Delete are enabled.",
                    "บันทึกโทเค็นผู้ดูแลแล้ว — ใช้คำสั่งวาดใหม่และลบได้",
                  )
                : t(
                    "No operator token — Repaint and Delete stay locked server-side.",
                    "ยังไม่มีโทเค็นผู้ดูแล — คำสั่งวาดใหม่และลบถูกล็อกไว้ที่เซิร์ฟเวอร์",
                  )}
            </span>
          </div>
          <form
            className="mt-2 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveAdminToken(tokenDraft);
              setTokenSet(Boolean(tokenDraft.trim()));
            }}
          >
            <input
              type="password"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              placeholder={t("Operator token", "โทเค็นผู้ดูแล")}
              autoComplete="off"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="press rounded-xl bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground"
            >
              {t("Save token", "บันทึกโทเค็น")}
            </button>
            {tokenSet && (
              <button
                type="button"
                onClick={() => {
                  saveAdminToken("");
                  setTokenDraft("");
                  setTokenSet(false);
                }}
                className="text-xs text-muted-foreground underline"
              >
                {t("Clear", "ล้าง")}
              </button>
            )}
</form>
          {opError && (
            <p className="mt-2 text-xs font-semibold text-destructive">{opError}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Use the same value as the ADMIN_TOKEN environment secret. It only lives in this browser session. Double-click the moon in the header to leave developer mode.",
              "ใช้ค่าเดียวกับ ADMIN_TOKEN ในตัวแปรสภาพแวดล้อม โทเค็นอยู่ในเบราว์เซอร์เซสชันนี้เท่านั้น ดับเบิลคลิกที่พระจันทร์ในแถบหัวเพื่อออกจากโหมดผู้พัฒนา",
            )}
          </p>
        </section>
      )}

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
