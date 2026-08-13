import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RouteMessage } from "@/components/RouteMessage";
import { StarRow } from "@/components/StarRow";
import { bookQuery } from "@/lib/books";
import { learningStats, useProgress } from "@/lib/progress";
import { useT } from "@/lib/i18n";

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
    <RouteMessage en="Progress could not be loaded." th="ไม่สามารถโหลดข้อมูลความก้าวหน้าได้" />
  ),
});

function ProgressPage() {
  const t = useT();
  const { bookId } = Route.useParams();
  const { data } = useSuspenseQuery(bookQuery(bookId));
  const { progress } = useProgress();
  const stats = learningStats(progress);

  const book = progress.books[bookId] ?? { stars: {}, read: {} };
  const totalStars = Object.values(book.stars).reduce((a, b) => a + b, 0);
  const tricky = Object.entries(progress.wordsMissed)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const toneName = (tone: string) =>
    tone === "0" ? t("neutral", "เสียงเบา") : t(`tone ${tone}`, `เสียง ${tone}`);

  return (
    <AppShell title={t("Progress", "ความก้าวหน้า")} back={{ to: "/book/$bookId", params: { bookId } }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("Stars earned", "ดาวที่ได้รับ")} value={`${totalStars} / ${data.chapters.length * 3}`} />
        <Stat label={t("Day streak", "วันต่อเนื่อง")} value={`${progress.streak} 🔥`} />
        <Stat label={t("Words mastered", "คำที่เชี่ยวชาญ")} value={`${progress.wordsMastered.length}`} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-widest text-primary">
        {t("Learning", "การเรียนรู้")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-primary/20 bg-card p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("Words learned", "คำที่เรียนรู้แล้ว")}
          </p>
          <p className="mt-1 text-2xl font-extrabold">{stats.learned}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              `${stats.meeting} more words are still getting to know you`,
              `อีก ${stats.meeting} คำกำลังทำความรู้จัก`,
            )}
          </p>
        </div>

        <div className="rounded-3xl border border-primary/20 bg-card p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("Listening accuracy", "ความแม่นยำในการฟัง")}
          </p>
          <p className="mt-1 text-2xl font-extrabold">
            {stats.listenAccuracy === null ? "—" : `${stats.listenAccuracy}%`}
            {stats.listenTrend !== 0 && (
              <span
                className={`ml-2 text-sm ${stats.listenTrend > 0 ? "text-gold" : "text-muted-foreground"}`}
              >
                {stats.listenTrend > 0 ? "↑" : "↓"} {Math.abs(stats.listenTrend)}%
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              `last ${stats.listenCount} listening questions`,
              `จาก ${stats.listenCount} คำถามฟังล่าสุด`,
            )}
          </p>
        </div>

        <div className="rounded-3xl border border-primary/20 bg-card p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("Review streak", "ความต่อเนื่องในการทบทวน")}
          </p>
          <p className="mt-1 text-2xl font-extrabold">
            {t(`${stats.activeLast7} of 7 days`, `${stats.activeLast7} จาก 7 วัน`)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats.dueForReview > 0
              ? t(
                  `${stats.dueForReview} words are ready for a review`,
                  `มี ${stats.dueForReview} คำที่ควรทบทวน`,
                )
              : t("Nothing waiting for review", "ยังไม่มีคำที่ต้องทบทวน")}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-primary/20 bg-card p-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {t("Tones practised", "เสียงวรรณยุกต์ที่ฝึก")}
        </p>
        <ul className="mt-3 flex items-end gap-3">
          {stats.tones.map((tone) => {
            const max = Math.max(1, ...stats.tones.map((x) => x.attempts));
            const height = Math.round((tone.attempts / max) * 64) + 4;
            return (
              <li key={tone.tone} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-bold text-muted-foreground">
                  {tone.rate === null ? "—" : `${tone.rate}%`}
                </span>
                <div
                  className="w-full rounded-t-xl bg-primary/70"
                  style={{ height }}
                  role="presentation"
                />
                <span className="text-[11px] text-muted-foreground">{toneName(tone.tone)}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          {t(
            "Taller bars mean more practice; the number above is how often it was right.",
            "แท่งสูงคือฝึกบ่อย ตัวเลขด้านบนคือความถูกต้อง",
          )}
        </p>
      </div>

      <div className="mt-4 rounded-3xl border border-primary/20 bg-card p-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {t("Characters written", "ตัวอักษรที่เขียนได้")}
        </p>
        <p className="mt-1 text-2xl font-extrabold">{progress.charsWritten.length}</p>
        {progress.charsWritten.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Tap a word and choose Write it to start your collection.",
              "แตะที่คำแล้วเลือก หัดเขียน เพื่อเริ่มสะสม",
            )}
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {progress.charsWritten.map((ch) => (
              <li
                key={ch}
                className="han rounded-2xl border border-gold/40 bg-secondary/50 px-3 py-1.5 text-xl font-bold text-gold"
              >
                {ch}
              </li>
            ))}
          </ul>
        )}
      </div>




      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-widest text-primary">
        {t("Chapters", "บทเรียน")}
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
                {book.read[chapter.idx] ? t("Read", "อ่านแล้ว") : t("Not read yet", "ยังไม่ได้อ่าน")}
              </p>
            </div>
            <StarRow count={book.stars[chapter.idx] ?? 0} size={16} />
          </li>
        ))}
      </ul>

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-widest text-primary">
        {t("Words to practise", "คำที่ควรฝึกฝน")}
      </h2>
      {tricky.length === 0 ? (
        <p className="text-muted-foreground">{t("No tricky words yet — great work!", "ยังไม่มีคำที่ยาก เก่งมาก!")}</p>
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
