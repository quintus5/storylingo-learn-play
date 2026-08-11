import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Music,
  Pause,
  PenLine,
  Play,
  VolumeX,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { WordPopup } from "@/components/WordPopup";
import { StrokeWriter, type WriteTarget } from "@/components/StrokeWriter";
import { useWritableChars } from "@/hooks/use-writable";

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
import { useLocalText, useT } from "@/lib/i18n";
import { normalizePinyin } from "@/lib/pinyin";

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
  const local = useLocalText();
  const { bookId, n } = Route.useParams();
  const idx = Number(n);
  const { data } = useSuspenseQuery(bookQuery(bookId));
  const { markRead, seeWords, progress: saved } = useProgress();
  const speaking = useSpeakingText();
  const progress = useSpeakingProgress();
  const [voice, chooseVoice] = useVoice();

  const chapter = data.chapters.find((c) => c.idx === idx);
  const pages = chapter?.pages ?? [];
  const [page, setPage] = useState(0);
  const [word, setWord] = useState<Word | null>(null);
  const [writing, setWriting] = useState<{
    targets: WriteTarget[];
    key: string;
    title: string;
    sentence?: { chars: string[]; native?: string };
  } | null>(null);

  const [playing, setPlaying] = useState(false);
  const [music, setMusic] = useState(false);
  const [dir, setDir] = useState(1);
  const [active, setActive] = useState(0);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [brokenArt, setBrokenArt] = useState<Record<string, true>>({});
  const trackRef = useRef<HTMLDivElement>(null);

  const current = pages[page];
  const isLast = page >= pages.length - 1;

  // Characters worth practising on this page, and across the whole chapter.
  const pageWords = useMemo(
    () => (current?.sentences ?? []).flatMap((s) => s.words ?? []),
    [current],
  );
  const chapterChars = useWritableChars(chapter?.words ?? []);
  // Only the line the reader is looking at right now, in reading order.
  const activeSentence = current?.sentences?.[active];
  const sentenceWords = useMemo(
    () => (activeSentence ? [{ hanzi: activeSentence.hanzi }] : []),
    [activeSentence],
  );
  const sentenceChars = useWritableChars(sentenceWords);
  const lookUp = useCallback(
    (hanzi: string): WriteTarget => {
      const hit = (chapter?.words ?? [])
        .concat(pageWords)
        .find((w) => w.hanzi === hanzi);
      return hit && hit.hanzi.length === 1
        ? { hanzi, pinyin: hit.pinyin, dict: hit.dict }
        : { hanzi };
    },
    [chapter?.words, pageWords],
  );

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

  // Warm the next page's illustration so page turns feel instant.
  useEffect(() => {
    const url = pages[page + 1]?.image_url;
    if (!url || typeof window === "undefined") return;
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }, [page, pages]);



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



  const artSrc = current.image_url ?? (page === 0 ? chapter.image_url : null) ?? chapter.image_url;
  const art = artSrc && !brokenArt[artSrc] ? artSrc : null;
  

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {/* Artwork layer — whole picture visible, blurred copy fills the gaps */}
      <div className="absolute inset-0 h-full w-full">
        {art ? (
          <>
            <img
              src={art}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
            />
            <img
              key={art}
              src={art}
              alt={t(`Illustration for ${chapter.title}, page ${page + 1}`, `ภาพประกอบของ ${chapter.title} หน้า ${page + 1}`)}
              fetchPriority="high"
              decoding="async"
              loading="eager"
              onError={() => setBrokenArt((prev) => ({ ...prev, [art]: true }))}
              className="relative h-full w-full object-contain animate-[art-fade_.5s_ease-out_both]"
            />
          </>
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
          {t("Ch.", "บทที่")} {idx} · {local(chapter.title, chapter.title_th)}
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

      {/* Bottom bar — the glass box only wraps the sentence; controls sit outside it */}
      <section className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-stretch gap-2 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-end sm:gap-3 sm:px-6">
        {/* On phones the two control clusters share one row under the box; on
            wider screens `contents` lets them sit either side of it. */}
        <div className="order-2 flex w-full items-center justify-between gap-2 sm:contents">
          <div className="order-1 flex items-center gap-2 sm:w-44 sm:shrink-0 sm:pb-1">
            <button
              onClick={() => void speak(current.sentences[active]?.hanzi ?? "")}
              className="press inline-flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground"
            >
              <Play className="h-3.5 w-3.5" /> {t("Hear", "ฟัง")}
            </button>
            {sentenceChars.length > 0 && (
              <button
                onClick={() => {
                  stopAudio();
                  setPlaying(false);
                  setWriting({
                    targets: sentenceChars.map(lookUp),
                    key: `${chapter.id}:page:${page}:sentence:${active}`,
                    title: t("Write this line", "หัดเขียนบรรทัดนี้"),
                    sentence: { chars: sentenceChars, native: activeSentence?.native },
                  });
                }}
                aria-label={t(
                  `Write the ${sentenceChars.length} characters in this line`,
                  `หัดเขียน ${sentenceChars.length} ตัวอักษรในบรรทัดนี้`,
                )}
                className="press relative inline-flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground"
              >
                <PenLine className="h-3.5 w-3.5" /> {t("Write", "เขียน")}
                {/* Tiny badge: turns gold once every character here is written. */}
                <span
                  className={`absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                    sentenceChars.every((c) => saved.charsWritten.includes(c))
                      ? "bg-gold text-background"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {sentenceChars.length}
                </span>
              </button>
            )}

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
          </div>

          <div className="order-3 flex items-center justify-end gap-1 sm:w-44 sm:shrink-0 sm:pb-1">
            <button
              onClick={() => go(-1)}
              disabled={page === 0}
              aria-label={t("Previous page", "หน้าก่อนหน้า")}
              className="press group inline-flex h-9 items-center gap-1 rounded-full border border-border/30 bg-secondary/70 px-2.5 text-secondary-foreground backdrop-blur-sm transition-all duration-200 hover:bg-secondary disabled:opacity-30 motion-reduce:transition-none"
            >
              <ChevronLeft className="h-5 w-5 shrink-0" />
              <span className="max-w-0 overflow-hidden whitespace-nowrap text-[11px] font-bold opacity-0 transition-all duration-200 group-hover:max-w-[7rem] group-hover:opacity-100 group-focus-visible:max-w-[7rem] group-focus-visible:opacity-100 motion-reduce:transition-none">
                {t("Previous page", "หน้าก่อนหน้า")}
              </span>
            </button>

            {isLast ? (
              <>
                {chapterChars.length > 0 && (
                  <button
                    onClick={() => {
                      stopAudio();
                      setPlaying(false);
                      setWriting({
                        targets: chapterChars.slice(0, 12).map(lookUp),
                        key: `${chapter.id}:chapter`,
                        title: t("Practice writing", "ฝึกเขียน"),
                      });
                    }}
                    className="press inline-flex h-9 items-center gap-1 rounded-full border border-border/30 bg-secondary/70 px-3 text-xs font-bold text-secondary-foreground backdrop-blur-sm"
                  >
                    <PenLine className="h-4 w-4" /> {t("Practice writing", "ฝึกเขียน")}
                  </button>
                )}
                <Link
                  to="/book/$bookId/chapter/$n/quiz"
                  params={{ bookId, n }}
                  onClick={() => stopAudio()}
                  aria-label={t("Go to the quiz", "ไปที่แบบทดสอบ")}
                  className="press inline-flex h-9 items-center gap-1 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground"
                >
                  {t("Quiz", "แบบทดสอบ")} <ChevronRight className="h-4 w-4" />
                </Link>
              </>
            ) : (

              <button
                onClick={() => go(1)}
                aria-label={t(
                  `Next page. Page ${page + 1} of ${pages.length}`,
                  `หน้าถัดไป หน้า ${page + 1} จาก ${pages.length}`,
                )}
                className="press group inline-flex h-9 items-center gap-1 rounded-full border border-primary/40 bg-primary/80 px-2.5 text-primary-foreground backdrop-blur-sm transition-all duration-200 hover:bg-primary motion-reduce:transition-none"
              >
                <span className="max-w-0 overflow-hidden whitespace-nowrap text-[11px] font-bold opacity-0 transition-all duration-200 group-hover:max-w-[9rem] group-hover:opacity-100 group-focus-visible:max-w-[9rem] group-focus-visible:opacity-100 motion-reduce:transition-none">
                  {t(
                    `Next page · ${page + 1}/${pages.length}`,
                    `หน้าถัดไป · ${page + 1}/${pages.length}`,
                  )}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0" />
              </button>
            )}
          </div>
        </div>

        <div className="relative order-1 mx-auto w-full sm:order-2 sm:w-[min(38rem,68%)]">
          <div
            ref={trackRef}
            onScroll={onTrackScroll}
            className="glass-subtitle flex snap-x snap-mandatory items-stretch overflow-x-auto overflow-y-hidden rounded-[1.5rem] border border-border/40 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {current.sentences.map((sentence, i) => (
              <div
                key={`${page}-${i}`}
                className={`w-full shrink-0 snap-center ${
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
      </section>



      {word && <WordPopup word={word} onClose={() => setWord(null)} />}
      {writing && (
        <StrokeWriter
          targets={writing.targets}
          bonusKey={writing.key}
          title={writing.title}
          sentence={writing.sentence}
          onClose={() => setWriting(null)}
        />
      )}

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

/** Soft, translucent chevron for stepping between sentences. */
function SentenceArrow({
  side,
  hidden,
  label,
  onClick,
}: {
  side: "left" | "right";
  hidden: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      tabIndex={hidden ? -1 : 0}
      className={`absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-border/40 bg-background/45 text-foreground/80 backdrop-blur-sm transition-all duration-200 hover:bg-background/70 hover:text-foreground active:scale-90 motion-reduce:transition-none ${
        side === "left" ? "left-1 sm:-left-12" : "right-1 sm:-right-12"
      } ${
        hidden
          ? "pointer-events-none opacity-0"
          : side === "left"
            ? "opacity-80 hover:-translate-x-0.5 motion-reduce:hover:translate-x-0"
            : "opacity-80 hover:translate-x-0.5 motion-reduce:hover:translate-x-0"
      }`}
    >
      {side === "left" ? (
        <ChevronLeft className="h-6 w-6" />
      ) : (
        <ChevronRight className="h-6 w-6" />
      )}
    </button>
  );
}

function SentenceCard({
  sentence,
  speaking,
  progress = -1,
  dimmed = false,
  onWord,
}: {
  sentence: Sentence;
  speaking: boolean;
  progress?: number;
  dimmed?: boolean;
  onWord: (word: Word) => void;
}) {
  const active = speaking ? activeWordIndex(sentence, progress) : -1;
  return (
    <article
      className={`flex h-full flex-col justify-center px-5 py-3 text-center transition-opacity duration-300 motion-reduce:transition-none ${
        dimmed ? "opacity-45" : "opacity-100"
      }`}
    >
      <div className="flex flex-wrap items-end justify-center gap-x-1">
        {wordsMatchSentence(sentence.hanzi, sentence.words)

          ? sentence.words.map((w, i) => (
              <button
                key={`${w.hanzi}-${i}`}
                onClick={() => onWord(w)}
                className="press rounded-lg px-0.5 text-left"
              >
                <span
                  className={`block text-xs ${i === active ? "text-gold" : "text-primary"}`}
                >
                  {normalizePinyin(w.pinyin, w.hanzi)}
                </span>
                <span
                  className={`han block origin-bottom text-2xl font-bold leading-tight transition-transform duration-200 motion-reduce:transform-none motion-reduce:transition-none ${
                    i === active ? "scale-[1.4] text-gold" : "text-sand"
                  }`}
                >
                  {w.hanzi}
                </span>
              </button>
            ))
          : (
              <div>
                <span className="block text-xs text-primary">{normalizePinyin(sentence.pinyin, sentence.hanzi)}</span>
                <span className="han block text-2xl font-bold text-sand">{sentence.hanzi}</span>
              </div>
            )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{sentence.native}</p>
    </article>

  );
}

