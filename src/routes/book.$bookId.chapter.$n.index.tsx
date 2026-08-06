import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Music,
  Pause,
  Play,
  VolumeX,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WordPopup } from "@/components/WordPopup";
import { bookQuery } from "@/lib/books";
import { useProgress } from "@/lib/progress";
import { preload, speak, speakSequence, stopAudio } from "@/lib/audio";
import { moodFor, setMusicDucked, startMusic, stopMusic } from "@/lib/music";
import { useSpeakingProgress, useSpeakingText } from "@/hooks/use-speaking";
import { useVoice } from "@/hooks/use-voice";
import type { Sentence, Word } from "@/lib/types";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/book/$bookId/chapter/$n/")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(bookQuery(params.bookId)),
  head: ({ loaderData, params }) => {
    const chapter = loaderData?.chapters.find((c) => c.idx === Number(params.n));
    const title = chapter ? `${chapter.title} — StoryLingo` : "Chapter — StoryLingo";
    const description =
      chapter?.summary?.split("SCENE:")[0]?.trim() ||
      "Read this chapter in Mandarin with pinyin, Thai and audio.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: Reader,
  errorComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">{useT()("This chapter could not be opened.", "ไม่สามารถเปิดบทนี้ได้")}</p>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">{useT()("Chapter not found.", "ไม่พบบทนี้")}</p>
    </AppShell>
  ),
});

function Reader() {
  const t = useT();
  const { bookId, n } = Route.useParams();
  const idx = Number(n);
  const { data } = useSuspenseQuery(bookQuery(bookId));
  const { markRead, seeWords } = useProgress();
  const speaking = useSpeakingText();
  const progress = useSpeakingProgress();
  const [voice, chooseVoice] = useVoice();

  const chapter = data.chapters.find((c) => c.idx === idx);
  const pages = chapter?.pages ?? [];
  const [page, setPage] = useState(0);
  const [word, setWord] = useState<Word | null>(null);
  const [playing, setPlaying] = useState(false);
  const [music, setMusic] = useState(false);
  const [dir, setDir] = useState(1);
  const [panel, setPanel] = useState<"subtitle" | "peek" | "full">("subtitle");
  const panelRef = useRef<HTMLDivElement>(null);

  const current = pages[page];
  const isLast = page >= pages.length - 1;

  const nextChapter = data.chapters.find((c) => c.idx === idx + 1);

  const sentenceTexts = useMemo(
    () => (current?.sentences ?? []).map((s) => s.hanzi),
    [current],
  );

  useEffect(() => () => {
    stopAudio();
    stopMusic();
  }, []);

  const mood = useMemo(
    () => moodFor([chapter?.title, chapter?.summary, current?.scene].filter(Boolean).join(" ")),
    [chapter?.title, chapter?.summary, current?.scene],
  );

  // Restart the loop whenever the scene's mood changes.
  useEffect(() => {
    if (music) startMusic(mood);
  }, [music, mood]);

  // Keep the music quiet under narration.
  useEffect(() => {
    setMusicDucked(Boolean(speaking));
  }, [speaking]);

  useEffect(() => {
    if (!chapter) return;
    seeWords((chapter.words ?? []).map((w) => w.hanzi));
    preload(
      (chapter.pages ?? []).flatMap((p) => p.sentences.map((s) => s.hanzi)),
      (chapter.words ?? []).map((w) => w.hanzi),
    );
    if (nextChapter) {
      preload([], (nextChapter.words ?? []).slice(0, 8).map((w) => w.hanzi));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.id]);

  useEffect(() => {
    if (isLast && chapter) markRead(bookId, idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLast, page, chapter?.id]);

  // Every new page starts art-first, scrolled back to the top.
  useEffect(() => {
    setPanel("subtitle");
    panelRef.current?.scrollTo({ top: 0 });
  }, [page]);


  if (!chapter || pages.length === 0) {
    return (
      <AppShell back={{ to: "/book/$bookId", params: { bookId } }}>
        <p className="text-muted-foreground">{t("This chapter is still being written.", "บทนี้กำลังถูกเขียนอยู่")}</p>
      </AppShell>
    );
  }

  async function playPage() {
    if (playing) {
      stopAudio();
      setPlaying(false);
      setPanel("full");
      return;
    }
    setPlaying(true);
    setPanel("subtitle");
    await speakSequence(sentenceTexts);
    setPlaying(false);
    setPanel("full");
  }


  function go(delta: number) {
    stopAudio();
    setPlaying(false);
    setPage((p) => {
      const next = Math.min(Math.max(p + delta, 0), pages.length - 1);
      if (next !== p) setDir(delta > 0 ? 1 : -1);
      return next;
    });
  }

  const art = current.image_url ?? (page === 0 ? chapter.image_url : null) ?? chapter.image_url;
  const spoken = current.sentences.find((s) => s.hanzi === speaking);
  const subtitle = spoken ?? current.sentences[0];

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {/* Artwork layer */}
      <button
        type="button"
        onClick={() => setPanel(panel === "full" ? "subtitle" : "full")}
        aria-label={panel === "full" ? t("Show the picture", "แสดงรูปภาพ") : t("Show the whole page", "แสดงหน้าทั้งหมด")}

        className="absolute inset-0 h-full w-full cursor-pointer"
      >
        {art ? (
          <img
            key={art}
            src={art}
            alt={t(`Illustration for ${chapter.title}, page ${page + 1}`, `ภาพประกอบของ ${chapter.title} หน้า ${page + 1}`)}
            className="h-full w-full object-cover animate-[art-fade_.5s_ease-out_both,ken-burns_14s_ease-out_both]"
          />
        ) : (
          <div className="h-full w-full bg-secondary" />
        )}
        <span
          className={`art-scrim pointer-events-none absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${
            panel === "subtitle" ? "opacity-40" : "opacity-100"
          }`}
        />

      </button>

      {/* Floating controls */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-3">
        <Link
          to="/book/$bookId"
          params={{ bookId }}
          onClick={() => stopAudio()}
          aria-label={t("Go back", "ย้อนกลับ")}
          className="press glass-pill pointer-events-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/50 text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <p className="glass-pill pointer-events-none min-w-0 flex-1 truncate rounded-full border border-border/40 px-4 py-2 text-sm font-bold text-foreground">
          {t("Ch.", "บทที่")} {idx} · {chapter.title}
        </p>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <button
            onClick={() => {
              chooseVoice(voice === "female" ? "male" : "female");
              stopAudio();
              setPlaying(false);
            }}
            aria-label={voice === "female" ? t("Narrator: female. Tap to switch.", "เสียงผู้บรรยาย: หญิง แตะเพื่อเปลี่ยน") : t("Narrator: male. Tap to switch.", "เสียงผู้บรรยาย: ชาย แตะเพื่อเปลี่ยน")}
            title={t("Switch narrator", "เปลี่ยนเสียงผู้บรรยาย")}
            className="press glass-pill inline-flex h-10 items-center gap-2 rounded-full border border-border/50 px-3 text-sm font-bold text-foreground"
          >
            <span aria-hidden>{voice === "female" ? "👩" : "👨"}</span>
          </button>
          <button
            onClick={() => {
              if (music) {
                stopMusic();
                setMusic(false);
              } else {
                setMusic(true);
              }
            }}
            aria-label={music ? t("Turn off background music", "ปิดเพลงประกอบ") : t("Turn on background music", "เปิดเพลงประกอบ")}
            className="press glass-pill inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/50 text-foreground"
          >
            {music ? <Music className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            onClick={() => void playPage()}
            className="press inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground shadow-lg"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span className="hidden sm:inline">{playing ? t("Stop", "หยุด") : t("Read to me", "อ่านให้ฟัง")}</span>
          </button>
        </div>
      </header>

      {/* Reading panel — subtitle by default, opens to a full page */}
      <section
        className={`absolute z-10 flex flex-col overflow-hidden border transition-all duration-500 ease-out motion-reduce:transition-none ${
          panel === "full"
            ? "glass-full inset-x-0 bottom-0 h-[100dvh] max-h-[100dvh] rounded-t-[2rem] border-border/60 pt-14"
            : panel === "peek"
              ? "glass-subtitle inset-x-2 bottom-3 max-h-[34vh] rounded-[1.75rem] border-border/40 sm:inset-x-6"
              : "glass-subtitle inset-x-2 bottom-3 max-h-[24vh] rounded-[1.75rem] border-border/40 sm:inset-x-6"
        }`}
      >
        <button
          type="button"
          onClick={() => setPanel(panel === "full" ? "subtitle" : "full")}
          aria-label={panel === "full" ? t("Collapse the text", "ย่อข้อความ") : t("Show the whole page", "แสดงหน้าทั้งหมด")}
          className="mx-auto flex h-7 w-full max-w-5xl shrink-0 items-center justify-center text-muted-foreground"
        >
          {panel === "full" ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronUp className="h-5 w-5" />
          )}
        </button>

        <div
          ref={panelRef}
          onScroll={(e) => {
            if (e.currentTarget.scrollTop > 8) setPanel("full");
          }}
          className={`mx-auto w-full max-w-5xl flex-1 overflow-y-auto ${
            panel === "full" ? "px-4 pb-2" : "px-3 pb-1"
          }`}
        >
          <div
            key={`${page}-${panel === "full" ? "all" : "one"}`}
            className={`space-y-3 ${
              dir > 0
                ? "animate-[page-in-next_.4s_cubic-bezier(.22,.8,.3,1)_both]"
                : "animate-[page-in-prev_.4s_cubic-bezier(.22,.8,.3,1)_both]"
            }`}
          >
            {panel === "full" ? (
              current.sentences.map((sentence, i) => (
                <SentenceCard
                  key={i}
                  sentence={sentence}
                  speaking={speaking === sentence.hanzi}
                  progress={speaking === sentence.hanzi ? progress : -1}
                  onWord={setWord}
                />
              ))
            ) : (
              <SentenceCard
                sentence={subtitle}
                speaking={Boolean(playing && spoken)}
                progress={spoken ? progress : -1}
                compact
                onWord={setWord}
              />
            )}
          </div>
        </div>

        {panel === "full" ? (
          <nav className="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
            <button
              onClick={() => go(-1)}
              disabled={page === 0}
              aria-label={t("Previous page", "หน้าก่อนหน้า")}
              className="press inline-flex items-center gap-1 rounded-2xl bg-secondary px-4 py-2.5 font-bold text-secondary-foreground disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="hidden sm:inline">{t("Back", "ย้อนกลับ")}</span>
            </button>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {t(`Page ${page + 1} of ${pages.length}`, `หน้า ${page + 1} จาก ${pages.length}`)}
            </p>
            {isLast ? (
              <Link
                to="/book/$bookId/chapter/$n/quiz"
                params={{ bookId, n }}
                onClick={() => stopAudio()}
                className="press inline-flex items-center gap-1 rounded-2xl bg-primary px-4 py-2.5 font-bold text-primary-foreground"
              >
                {t("Quiz", "แบบทดสอบ")} <ChevronRight className="h-5 w-5" />
              </Link>
            ) : (
              <button
                onClick={() => go(1)}
                className="press inline-flex items-center gap-1 rounded-2xl bg-primary px-4 py-2.5 font-bold text-primary-foreground"
              >
                <span className="hidden sm:inline">{t("Next", "ถัดไป")}</span>
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </nav>
        ) : (
          <nav className="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-2 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
            <button
              onClick={() => go(-1)}
              disabled={page === 0}
              aria-label={t("Previous page", "หน้าก่อนหน้า")}
              className="press inline-flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <p className="text-[11px] text-muted-foreground">
              {page + 1} / {pages.length}
            </p>
            {isLast ? (
              <Link
                to="/book/$bookId/chapter/$n/quiz"
                params={{ bookId, n }}
                onClick={() => stopAudio()}
                aria-label={t("Go to the quiz", "ไปที่แบบทดสอบ")}
                className="press inline-flex h-9 items-center gap-1 rounded-full bg-primary px-3 text-sm font-bold text-primary-foreground"
              >
                {t("Quiz", "แบบทดสอบ")} <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <button
                onClick={() => go(1)}
                aria-label={t("Next page", "หน้าถัดไป")}
                className="press inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </nav>
        )}
      </section>


      {word && <WordPopup word={word} onClose={() => setWord(null)} />}
    </div>
  );
}

/**
 * Which word is being said right now, estimated from clip progress weighted
 * by how many characters each word has. -1 when nothing is playing.
 */
function activeWordIndex(sentence: Sentence, progress: number) {
  if (progress < 0 || sentence.words.length === 0) return -1;
  const weights = sentence.words.map((w) => Math.max(w.hanzi.length, 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (progress <= acc / total) return i;
  }
  return weights.length - 1;
}

function SentenceCard({
  sentence,
  speaking,
  progress = -1,
  compact = false,
  onWord,
}: {
  sentence: Sentence;
  speaking: boolean;
  progress?: number;
  compact?: boolean;
  onWord: (word: Word) => void;
}) {
  const active = speaking ? activeWordIndex(sentence, progress) : -1;
  return (
    <article
      className={
        compact
          ? "rounded-2xl px-1 py-1 text-center"
          : `rounded-3xl border p-4 transition-colors ${
              speaking
                ? "border-gold/70 bg-card animate-[speak_1.2s_ease-in-out_infinite]"
                : "border-border/70 bg-card/70"
            }`
      }
    >
      <div
        className={`flex flex-wrap items-end gap-x-1 gap-y-1 ${compact ? "justify-center" : ""}`}
      >
        {sentence.words.length > 0
          ? sentence.words.map((w, i) => (
              <button
                key={`${w.hanzi}-${i}`}
                onClick={() => onWord(w)}
                className={`press rounded-xl px-1 py-0.5 text-left transition-colors duration-150 motion-reduce:transition-none hover:bg-secondary ${
                  i === active ? "bg-gold/25 ring-1 ring-gold/60" : ""
                }`}
              >
                <span
                  className={`block text-[10px] ${i === active ? "text-gold" : "text-primary"}`}
                >
                  {w.pinyin}
                </span>
                <span
                  className={`han block font-bold leading-tight transition-transform duration-150 motion-reduce:transform-none ${
                    i === active ? "scale-105 text-gold" : "text-sand"
                  } ${compact ? "text-2xl" : "text-3xl"}`}
                >
                  {w.hanzi}
                </span>
              </button>
            ))
          : (
              <div>
                <span className="block text-[10px] text-primary">{sentence.pinyin}</span>
                <span
                  className={`han block font-bold text-sand ${compact ? "text-2xl" : "text-3xl"}`}
                >
                  {sentence.hanzi}
                </span>
              </div>
            )}
      </div>
      {!compact && <p className="mt-2 text-sm text-primary/90">{sentence.pinyin}</p>}
      <p
        className={`text-muted-foreground ${compact ? "mt-1 text-sm" : "mt-1 text-base"}`}
      >
        {sentence.native}
      </p>
      {!compact && (
        <button
          onClick={() => void speak(sentence.hanzi)}
          className="press mt-3 inline-flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-bold text-secondary-foreground"
        >
          <Play className="h-4 w-4" /> {useT()("Hear this line", "ฟังประโยคนี้")}
        </button>
      )}
    </article>
  );

}
