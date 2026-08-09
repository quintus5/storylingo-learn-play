import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Music,
  Pause,
  Play,
  VolumeX,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { WordPopup } from "@/components/WordPopup";
import { bookQuery } from "@/lib/books";
import { useProgress } from "@/lib/progress";
import {
  preload,
  speak,
  speakSequence,
  stopAudio,
  VOICE_LIST,
  VOICE_NAMES,
} from "@/lib/audio";
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

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

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
  const [active, setActive] = useState(0);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

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

  const scrollToSentence = useCallback((i: number) => {
    const track = trackRef.current;
    const card = track?.children[i] as HTMLElement | undefined;
    if (!track || !card) return;
    track.scrollTo({
      left: card.offsetLeft - (track.clientWidth - card.clientWidth) / 2,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, []);

  // Every new page starts on its first sentence.
  useEffect(() => {
    setActive(0);
    trackRef.current?.scrollTo({ left: 0 });
  }, [page]);

  // Follow the narration: slide the spoken sentence into the middle.
  useEffect(() => {
    if (!speaking || !current) return;
    const i = current.sentences.findIndex((s) => s.hanzi === speaking);
    if (i >= 0) {
      setActive(i);
      scrollToSentence(i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaking]);

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
      return;
    }
    setPlaying(true);
    await speakSequence(sentenceTexts);
    setPlaying(false);
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

  function onTrackScroll() {
    const track = trackRef.current;
    if (!track) return;
    const centre = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    Array.from(track.children).forEach((el, i) => {
      const child = el as HTMLElement;
      const mid = child.offsetLeft + child.clientWidth / 2;
      const dist = Math.abs(mid - centre);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setActive(best);
  }

  function goSentence(delta: number) {
    const count = current?.sentences.length ?? 0;
    const next = Math.min(Math.max(active + delta, 0), Math.max(count - 1, 0));
    if (next === active) return;
    setActive(next);
    scrollToSentence(next);
  }



  const art = current.image_url ?? (page === 0 ? chapter.image_url : null) ?? chapter.image_url;

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {/* Artwork layer */}
      <div className="absolute inset-0 h-full w-full">
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
        <span className="art-scrim pointer-events-none absolute inset-0 opacity-70" />
      </div>

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
          <div className="relative">
            <button
              onClick={() => setVoiceOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={voiceOpen}
              aria-label={t("Choose the narrator voice", "เลือกเสียงผู้บรรยาย")}
              className="press glass-pill inline-flex h-10 items-center gap-1.5 rounded-full border border-border/50 px-3 text-sm font-bold text-foreground"
            >
              <span className="hidden text-muted-foreground sm:inline">{t("Voice", "เสียง")}</span>
              <span>{VOICE_NAMES[voice]}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {voiceOpen && (
              <div
                role="menu"
                className="glass-subtitle absolute right-0 top-12 z-30 w-36 overflow-hidden rounded-2xl border border-border/50 p-1 animate-[fade-in_.15s_ease-out]"
              >
                {VOICE_LIST.map((id) => (
                  <button
                    key={id}
                    role="menuitemradio"
                    aria-checked={voice === id}
                    onClick={() => {
                      chooseVoice(id);
                      stopAudio();
                      setPlaying(false);
                      setVoiceOpen(false);
                    }}
                    className={`block w-full rounded-xl px-3 py-2 text-left text-sm font-bold transition-colors ${
                      voice === id
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-secondary"
                    }`}
                  >
                    {VOICE_NAMES[id]}
                  </button>
                ))}
              </div>
            )}
          </div>
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

      {/* Reading strip — sentences slide sideways, never covering the art */}
      <section className="glass-subtitle absolute inset-x-2 bottom-3 z-10 flex flex-col overflow-hidden rounded-[1.75rem] border border-border/40 sm:inset-x-6">
        <div className="relative">
          <div
            ref={trackRef}
            onScroll={onTrackScroll}
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden px-[6%] pb-1 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {current.sentences.map((sentence, i) => (
              <div
                key={`${page}-${i}`}
                className={`w-[88%] shrink-0 snap-center ${
                  dir > 0
                    ? "animate-[page-in-next_.4s_cubic-bezier(.22,.8,.3,1)_both]"
                    : "animate-[page-in-prev_.4s_cubic-bezier(.22,.8,.3,1)_both]"
                }`}
              >
                <SentenceCard
                  sentence={sentence}
                  speaking={speaking === sentence.hanzi}
                  progress={speaking === sentence.hanzi ? progress : -1}
                  dimmed={i !== active}
                  onWord={setWord}
                />
              </div>
            ))}
          </div>

          {current.sentences.length > 1 && (
            <>
              <SentenceArrow
                side="left"
                hidden={active === 0}
                label={t("Previous sentence", "ประโยคก่อนหน้า")}
                onClick={() => goSentence(-1)}
              />
              <SentenceArrow
                side="right"
                hidden={active >= current.sentences.length - 1}
                label={t("Next sentence", "ประโยคถัดไป")}
                onClick={() => goSentence(1)}
              />
            </>
          )}
        </div>

        <nav className="flex shrink-0 items-center justify-end gap-2 px-3 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-0.5">
          <button
            onClick={() => void speak(current.sentences[active]?.hanzi ?? "")}
            className="press inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-secondary-foreground"
          >
            <Play className="h-3 w-3" /> {t("Hear this line", "ฟังประโยคนี้")}
          </button>

          {current.sentences.length > 1 && (
            <div className="flex items-center gap-1">
              {current.sentences.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none ${
                    i === active ? "w-4 bg-gold" : "w-1.5 bg-muted-foreground/40"
                  }`}
                />
              ))}
            </div>
          )}

          <button
            onClick={() => go(-1)}
            disabled={page === 0}
            aria-label={t("Previous page", "หน้าก่อนหน้า")}
            className="press group inline-flex h-8 items-center gap-1 rounded-full bg-secondary px-2 text-secondary-foreground transition-all duration-200 hover:pr-3 disabled:opacity-40 motion-reduce:transition-none"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span className="max-w-0 overflow-hidden whitespace-nowrap text-[11px] font-bold opacity-0 transition-all duration-200 group-hover:max-w-[7rem] group-hover:opacity-100 group-focus-visible:max-w-[7rem] group-focus-visible:opacity-100 motion-reduce:transition-none">
              {t("Previous page", "หน้าก่อนหน้า")}
            </span>
          </button>

          {isLast ? (
            <Link
              to="/book/$bookId/chapter/$n/quiz"
              params={{ bookId, n }}
              onClick={() => stopAudio()}
              aria-label={t("Go to the quiz", "ไปที่แบบทดสอบ")}
              className="press inline-flex h-8 items-center gap-1 rounded-full bg-primary px-3 text-[11px] font-bold text-primary-foreground"
            >
              {t("Quiz", "แบบทดสอบ")} <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <button
              onClick={() => go(1)}
              aria-label={t(
                `Next page. Page ${page + 1} of ${pages.length}`,
                `หน้าถัดไป หน้า ${page + 1} จาก ${pages.length}`,
              )}
              className="press group inline-flex h-8 items-center gap-1 rounded-full bg-primary px-2 text-primary-foreground transition-all duration-200 hover:pl-3 motion-reduce:transition-none"
            >
              <span className="max-w-0 overflow-hidden whitespace-nowrap text-[11px] font-bold opacity-0 transition-all duration-200 group-hover:max-w-[9rem] group-hover:opacity-100 group-focus-visible:max-w-[9rem] group-focus-visible:opacity-100 motion-reduce:transition-none">
                {t(
                  `Next page · ${page + 1}/${pages.length}`,
                  `หน้าถัดไป · ${page + 1}/${pages.length}`,
                )}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
          )}
        </nav>
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
  dimmed = false,
  onPlay,
  onWord,
}: {
  sentence: Sentence;
  speaking: boolean;
  progress?: number;
  dimmed?: boolean;
  onPlay: () => void;
  onWord: (word: Word) => void;
}) {
  const t = useT();
  const active = speaking ? activeWordIndex(sentence, progress) : -1;
  return (
    <article
      className={`rounded-2xl px-2 py-1 text-center transition-opacity duration-300 motion-reduce:transition-none ${
        dimmed ? "opacity-45" : "opacity-100"
      }`}
    >
      <div className="flex min-h-[3.5rem] flex-wrap items-end justify-center gap-x-1 gap-y-1">
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
                  className={`han block origin-bottom text-2xl font-bold leading-tight transition-transform duration-200 motion-reduce:transform-none motion-reduce:transition-none ${
                    i === active ? "scale-[1.35] text-gold" : "text-sand"
                  }`}
                >
                  {w.hanzi}
                </span>
              </button>
            ))
          : (
              <div>
                <span className="block text-[10px] text-primary">{sentence.pinyin}</span>
                <span className="han block text-2xl font-bold text-sand">{sentence.hanzi}</span>
              </div>
            )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{sentence.native}</p>
      <button
        onClick={onPlay}
        aria-label={t("Hear this line", "ฟังประโยคนี้")}
        className="press mt-1 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground"
      >
        <Play className="h-3.5 w-3.5" /> {t("Hear this line", "ฟังประโยคนี้")}
      </button>
    </article>
  );
}
