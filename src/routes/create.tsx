import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { BookOpen, Loader2, Search, Wand2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SignInPanel } from "@/components/SignInPanel";
import { useAuth } from "@/lib/auth";
import {
  createBook,
  generateChapter,
  markBookFailed,
  previewBook,
} from "@/lib/story.functions";
import { ART_STYLES, DEFAULT_ART_STYLE, artStyle } from "@/lib/art-styles";
import { CoinPurse } from "@/components/CoinPurse";
import { CharacterSprite } from "@/components/CharacterSprite";
import { characterPrompt } from "@/lib/character";
import { PRICES } from "@/lib/economy";
import { useProgress } from "@/lib/progress";
import { useLang, useT } from "@/lib/i18n";
import type { ArtStyleId } from "@/lib/art-styles";

type StoryPreview = {
  title: string;
  blurb: string;
  suggestedChapters: number;
  reason: string;
  chapterTitles: string[];
  wordCount: number;
  artStyle: ArtStyleId;
  artStyleReason: string;
  characters: string[];
  keyEvents: string[];
  th?: {
    title: string;
    blurb: string;
    reason: string;
    chapterTitles: string[];
    artStyleReason: string;
    characters: string[];
    keyEvents: string[];
  };
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
  component: CreateRoute,
});

/**
 * Anyone may make a book, but a grown-up signs in first: a book belongs to the
 * account that made it and stays private to them, so there has to be an
 * account to belong to. Reading the shelf never asks for one.
 */
function CreateRoute() {
  const t = useT();
  const { user, loaded } = useAuth();
  if (!loaded) return <AppShell title={t("New story", "สร้างนิทานใหม่")} back={{ to: "/" }}>{null}</AppShell>;
  if (!user) {
    return (
      <AppShell title={t("New story", "สร้างนิทานใหม่")} back={{ to: "/" }}>
        <SignInPanel redirectPath="/create" />
      </AppShell>
    );
  }
  return <CreatePage />;
}

function CreatePage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const create = useServerFn(createBook);
  const chapter = useServerFn(generateChapter);
  const preview = useServerFn(previewBook);
  const fail = useServerFn(markBookFailed);

  const { progress, spend } = useProgress();
  const buddy = progress.character;
  const canAfford = progress.coins >= PRICES.book;

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [chapterCount, setChapterCount] = useState(8);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [plan, setPlan] = useState<StoryPreview | null>(null);
  const [style, setStyle] = useState<ArtStyleId>(DEFAULT_ART_STYLE);
  const [error, setError] = useState<string | null>(null);
  /** A book whose generation stopped part-way, so it can be finished later. */
  const [stuckBookId, setStuckBookId] = useState<string | null>(null);


  // The model returns the plan in both languages; show whichever is selected.
  const planText = plan ? (lang === "th" && plan.th ? plan.th : plan) : null;

  const say = (line: string) => setLog((l) => [...l, line]);

  async function onFetch() {
    setError(null);
    setPlan(null);
    setFetching(true);
    try {
      const result = await preview({ data: { title: title.trim(), url: url.trim() } });
      setPlan(result);
      setChapterCount(result.suggestedChapters);
      setStyle(result.artStyle);
      if (!title.trim()) setTitle(result.title);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not read that link.", "อ่านลิงก์นี้ไม่ได้"));
    } finally {
      setFetching(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLog([]);
    setStuckBookId(null);
    // Coins are only taken once the book actually finishes, so a failed
    // generation never costs anything.
    if (!canAfford) {
      setError(
        t(
          `A new book costs ${PRICES.book} coins. You have ${progress.coins}. Read a chapter or play a quiz to earn more!`,
          `หนังสือเล่มใหม่ราคา ${PRICES.book} เหรียญ ตอนนี้คุณมี ${progress.coins} เหรียญ อ่านบทหรือเล่นแบบทดสอบเพื่อสะสมเหรียญเพิ่มนะ!`,
        ),
      );
      return;
    }
    setBusy(true);
    let startedBookId: string | null = null;
    try {

      say(t("Reading the story…", "กำลังอ่านนิทาน…"));
      const { bookId, chapterCount: count } = await create({
        data: {
          title: title.trim() || "A new story",
          url: url.trim(),
          chapterCount,
          artStyle: style,
          characterPrompt: characterPrompt(buddy),
        },
      });
      startedBookId = bookId;
      say(t(`Retelling it as ${count} chapters…`, `กำลังเล่าใหม่เป็น ${count} บท…`));
      // Chapters are built a few at a time so the whole book finishes much faster.
      const BATCH = 3;
      for (let start = 1; start <= count; start += BATCH) {
        const batch = Array.from(
          { length: Math.min(BATCH, count - start + 1) },
          (_, k) => start + k,
        );
        say(
          batch.length === 1
            ? t(
                `Writing chapter ${batch[0]} and painting its pictures…`,
                `กำลังเขียนบทที่ ${batch[0]} และวาดภาพประกอบ…`,
              )
            : t(
                `Writing chapters ${batch[0]}–${batch[batch.length - 1]} and painting their pictures…`,
                `กำลังเขียนบทที่ ${batch[0]}–${batch[batch.length - 1]} และวาดภาพประกอบ…`,
              ),
        );
        await Promise.all(batch.map((i) => chapter({ data: { bookId, idx: i } })));
      }
      say(t("Your book is ready!", "หนังสือของคุณพร้อมแล้ว!"));
      spend(PRICES.book);
      // The book is unpublished, but it belongs to this account, so its owner
      // can read it straight away — only the shared shelf waits for review.
      await navigate({ to: "/book/$bookId", params: { bookId } });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("Something went wrong.", "เกิดข้อผิดพลาดบางอย่าง");
      setError(message);
      if (startedBookId) {
        // Mark it so the bookshelf shows it as unfinished instead of "making…".
        setStuckBookId(startedBookId);
        try {
          await fail({ data: { bookId: startedBookId, message: message.slice(0, 300) } });
        } catch {
          /* the book is already flagged client-side */
        }
      }
    } finally {
      setBusy(false);
    }
  }


  return (
    <AppShell title={t("New story", "สร้างนิทานใหม่")} back={{ to: "/" }} right={<CoinPurse />}>
      <form onSubmit={onSubmit} className="mx-auto max-w-xl space-y-5">
        <div className="rounded-3xl border border-border bg-card p-5">
          <label className="block text-sm font-semibold" htmlFor="title">
            {t("Story title", "ชื่อนิทาน")}
          </label>
          <input
            id="title"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("The Little Star Who Lost Her Light", "ดาวน้อยที่แสงหาย")}
            className="mt-2 w-full rounded-2xl border border-input bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
          />

          <label className="mt-5 block text-sm font-semibold" htmlFor="url">
            {t("Where is the story?", "นิทานอยู่ที่ไหน")}
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Paste the web address of a story you like.",
              "วางลิงก์ของนิทานที่หนูชอบ แล้ว StoryLingo จะไปอ่านให้",
            )}
          </p>
          <input
            id="url"
            required
            type="url"
            value={url}
            maxLength={2000}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("https://example.com/a-bedtime-story", "https://example.com/a-bedtime-story")}
            className="mt-2 w-full rounded-2xl border border-input bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              "StoryLingo writes its own retelling of the story, so nothing is copied word for word.",
              "StoryLingo จะเล่านิทานใหม่ด้วยตัวเอง จึงไม่มีการคัดลอกคำต่อคำ",
            )}
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
            {fetching
              ? t("Reading the story…", "กำลังอ่านนิทาน…")
              : t("Find this story", "ไปหานิทานเรื่องนี้")}
          </button>

          <label className="mt-5 block text-sm font-semibold" htmlFor="chapters">
            {t("How many parts?", "แบ่งเป็นกี่ตอน")} · 
            {chapterCount === 1
              ? t("1 chapter (quick mini-book)", "1 บท (หนังสือเล่มเล็ก)")
              : t(`${chapterCount} chapters`, `${chapterCount} บท`)}
            {plan && chapterCount === plan.suggestedChapters && (
              <span className="ml-2 font-normal text-primary">· {t("suggested", "แนะนำ")}</span>
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
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Each part is one short reading with pictures and a game at the end.",
              "แต่ละตอนคือการอ่านสั้น ๆ พร้อมรูปภาพ และมีเกมตอนจบ",
            )}
          </p>

          <label className="mt-5 block text-sm font-semibold" htmlFor="art-style">
            {t("How should the pictures look?", "อยากให้รูปเป็นแบบไหน")}
            {plan && style === plan.artStyle && (
              <span className="ml-2 font-normal text-primary">· {t("detected", "ตรวจพบ")}</span>
            )}
          </label>
          <select
            id="art-style"
            value={style}
            onChange={(e) => setStyle(e.target.value as ArtStyleId)}
            className="mt-2 w-full rounded-2xl border border-input bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
          >
            {ART_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {t(s.label, s.labelTh ?? s.label)} — {t(s.hint, s.hintTh ?? s.hint)}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">
            {planText?.artStyleReason && style === plan?.artStyle
              ? planText.artStyleReason
              : t(artStyle(style).hint, artStyle(style).hintTh ?? artStyle(style).hint)}
          </p>


          <div className="mt-5 rounded-2xl bg-secondary/50 p-3 text-sm text-muted-foreground">
            {t(
              "Learning Mandarin Chinese (with pinyin) · explained in Thai",
              "เรียนภาษาจีนกลาง (พร้อมพินอิน) · อธิบายเป็นภาษาไทย",
            )}
          </div>
        </div>

        {plan && planText && (
          <section className="animate-[float-in_0.4s_ease-out] rounded-3xl border border-primary/25 bg-card/70 p-5">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
              <BookOpen className="h-4 w-4" /> {t("Suggested plan", "แผนที่แนะนำ")}
            </p>
            <h3 className="mt-2 text-xl font-extrabold">{planText.title}</h3>
            {planText.blurb && <p className="mt-1 text-sm text-muted-foreground">{planText.blurb}</p>}

            <div className="mt-4 rounded-2xl bg-secondary/50 p-3 text-sm">
              <p className="font-bold">
                {plan.suggestedChapters === 1
                  ? t("1 chapter suggested", "แนะนำ 1 บท")
                  : t(`${plan.suggestedChapters} chapters suggested`, `แนะนำ ${plan.suggestedChapters} บท`)}
              </p>
              {planText.reason && <p className="mt-1 text-muted-foreground">{planText.reason}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  `About ${plan.wordCount.toLocaleString()} words of source text. You can still move the slider.`,
                  `เนื้อหาต้นฉบับประมาณ ${plan.wordCount.toLocaleString()} คำ คุณยังสามารถเลื่อนแถบเปลี่ยนได้`,
                )}
              </p>
            </div>

            {planText.chapterTitles.length > 0 && (
              <ol className="mt-4 space-y-1 text-sm">
                {planText.chapterTitles.slice(0, chapterCount).map((title, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-bold text-primary">{i + 1}.</span>
                    <span>{title}</span>
                  </li>
                ))}
              </ol>
            )}

            {planText.characters.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t("Characters kept from the original", "ตัวละครจากเรื่องต้นฉบับ")}
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {planText.characters.map((c, i) => (
                    <li
                      key={i}
                      className="rounded-full bg-secondary/60 px-3 py-1 text-xs text-secondary-foreground"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {planText.keyEvents.length > 0 && (
              <details className="mt-4 rounded-2xl bg-secondary/40 p-3">
                <summary className="cursor-pointer text-sm font-bold">
                  {t(
                    `Real story beats we'll keep (${planText.keyEvents.length})`,
                    `เหตุการณ์สำคัญที่เราจะคงไว้ (${planText.keyEvents.length})`,
                  )}
                </summary>
                <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {planText.keyEvents.map((e, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-bold text-primary">{i + 1}.</span>
                      <span>{e}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t(
                    "StoryLingo retells the story in its own simple words but keeps these events, the characters and the real ending.",
                    "StoryLingo เล่านิทานใหม่ด้วยคำง่าย ๆ แต่ยังคงเหตุการณ์ ตัวละคร และตอนจบดั้งเดิมไว้",
                  )}
                </p>
              </details>
            )}



            {chapterCount !== plan.suggestedChapters && (
              <button
                type="button"
                onClick={() => setChapterCount(plan.suggestedChapters)}
                className="press mt-4 rounded-2xl bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground"
              >
                {t(`Use suggested (${plan.suggestedChapters})`, `ใช้ค่าที่แนะนำ (${plan.suggestedChapters})`)}
              </button>
            )}
          </section>
        )}



        <section className="flex items-center gap-4 rounded-3xl border border-border bg-card/70 p-4">
          {buddy ? (
            <CharacterSprite look={buddy} size={56} variant="bust" />
          ) : (
            <span className="text-4xl" aria-hidden>
              🧒
            </span>
          )}
          <div className="min-w-0 text-sm">
            {buddy ? (
              <p>
                <span className="font-bold">{buddy.name || t("Your buddy", "เพื่อนของคุณ")}</span>{" "}
                {t("will be painted into every picture of this book.", "จะปรากฏอยู่ในทุกภาพของหนังสือเล่มนี้")}
              </p>
            ) : (
              <p className="text-muted-foreground">
                {t(
                  "Make a story buddy and they'll appear inside your book's pictures.",
                  "สร้างเพื่อนคู่นิทานแล้วพวกเขาจะปรากฏในภาพหนังสือของคุณ",
                )}
              </p>
            )}
            <a
              href="/character"
              className="mt-1 inline-block font-bold text-primary underline-offset-4 hover:underline"
            >
              {buddy ? t("Change my buddy", "เปลี่ยนเพื่อนของฉัน") : t("Create my buddy", "สร้างเพื่อนของฉัน")}
            </a>
          </div>
        </section>

        <button
          type="submit"
          disabled={busy || !canAfford}
          className="press inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-lg font-extrabold text-primary-foreground disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
          {busy
            ? t("Building your book…", "กำลังสร้างหนังสือของคุณ…")
            : t(`Make my picture book · 🪙 ${PRICES.book}`, `สร้างหนังสือภาพของฉัน · 🪙 ${PRICES.book}`)}
        </button>
        <p className="text-center text-xs text-muted-foreground">
          {canAfford
            ? t(
                `You have 🪙 ${progress.coins}. A new book costs 🪙 ${PRICES.book}.`,
                `คุณมี 🪙 ${progress.coins} เหรียญ หนังสือเล่มใหม่ราคา 🪙 ${PRICES.book}`,
              )
            : t(
                `You need 🪙 ${PRICES.book - progress.coins} more coins. Read a chapter or play a quiz to earn some!`,
                `คุณต้องการเหรียญเพิ่มอีก 🪙 ${PRICES.book - progress.coins} เหรียญ อ่านบทหรือเล่นแบบทดสอบเพื่อสะสมเหรียญนะ!`,
              )}
        </p>
        <p className="text-center text-xs text-muted-foreground">
          {t(
            "Coins are pretend money kept on this device. You earn them by reading and by playing the games.",
            "เหรียญเป็นเงินสมมติที่เก็บไว้ในเครื่องนี้ ได้มาจากการอ่านและการเล่นเกม",
          )}
        </p>


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
          <div className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
            <p>{error}</p>
            {stuckBookId && (
              <>
                <p>
                  {t(
                    "No coins were spent. The part that was written is saved — you can finish it from the book page.",
                    "ยังไม่ได้หักเหรียญ ส่วนที่เขียนไว้ถูกบันทึกแล้ว ไปทำต่อได้ที่หน้าหนังสือ",
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => void navigate({ to: "/book/$bookId", params: { bookId: stuckBookId } })}
                  className="press inline-flex min-h-11 items-center rounded-2xl bg-secondary px-4 text-sm font-bold text-secondary-foreground"
                >
                  {t("Open the unfinished book", "เปิดหนังสือที่ยังไม่เสร็จ")}
                </button>
              </>
            )}
          </div>
        )}

      </form>
    </AppShell>
  );
}
