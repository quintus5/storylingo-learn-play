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
import { useSpeakingText } from "@/hooks/use-speaking";
import { useVoice } from "@/hooks/use-voice";
import type { Sentence, Word } from "@/lib/types";

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
      <p className="text-muted-foreground">This chapter could not be opened.</p>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">Chapter not found.</p>
    </AppShell>
  ),
});

function Reader() {
  const { bookId, n } = Route.useParams();
  const idx = Number(n);
  const { data } = useSuspenseQuery(bookQuery(bookId));
  const { markRead, seeWords } = useProgress();
  const speaking = useSpeakingText();
  const [voice, chooseVoice] = useVoice();

  const chapter = data.chapters.find((c) => c.idx === idx);
  const pages = chapter?.pages ?? [];
  const [page, setPage] = useState(0);
  const [word, setWord] = useState<Word | null>(null);
  const [playing, setPlaying] = useState(false);
  const [music, setMusic] = useState(false);
  const [dir, setDir] = useState(1);
  const [expanded, setExpanded] = useState(false);
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
    setExpanded(false);
    panelRef.current?.scrollTo({ top: 0 });
  }, [page]);

  if (!chapter || pages.length === 0) {
    return (
      <AppShell back={{ to: "/book/$bookId", params: { bookId } }}>
        <p className="text-muted-foreground">This chapter is still being written.</p>
      </AppShell>
    );
  }

  async function playPage() {
    if (playing) {
      stopAudio();
      setPlaying(false);
      setExpanded(true);
      return;
    }
    setPlaying(true);
    setExpanded(false);
    await speakSequence(sentenceTexts);
    setPlaying(false);
    setExpanded(true);
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

  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      {/* Artwork layer */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Show the picture" : "Show the whole page"}
        className="absolute inset-0 h-full w-full cursor-pointer"
      >
        {art ? (
          <img
            key={art}
            src={art}
            alt={`Illustration for ${chapter.title}, page ${page + 1}`}
            className="h-full w-full object-cover animate-[art-fade_.5s_ease-out_both,ken-burns_14s_ease-out_both]"
          />
        ) : (
          <div className="h-full w-full bg-secondary" />
        )}
        <span className="art-scrim pointer-events-none absolute inset-0" />
      </button>

      {/* Floating controls */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-3">
        <Link
          to="/book/$bookId"
          params={{ bookId }}
          onClick={() => stopAudio()}
          aria-label="Go back"
          className="press glass-pill pointer-events-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/50 text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <p className="glass-pill pointer-events-none min-w-0 flex-1 truncate rounded-full border border-border/40 px-4 py-2 text-sm font-bold text-foreground">
          Ch. {idx} · {chapter.title}
        </p>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <button
            onClick={() => {
              chooseVoice(voice === "female" ? "male" : "female");
              stopAudio();
              setPlaying(false);
            }}
            aria-label={`Narrator: ${voice === "female" ? "female" : "male"}. Tap to switch.`}
            title="Switch narrator"
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
            aria-label={music ? "Turn off background music" : "Turn on background music"}
            className="press glass-pill inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/50 text-foreground"
          >
            {music ? <Music className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            onClick={() => void playPage()}
            className="press inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground shadow-lg"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span className="hidden sm:inline">{playing ? "Stop" : "Read to me"}</span>
          </button>
        </div>
      </header>

      {/* Reading panel — subtitle by default, opens to a full page */}
      <section
        className={`absolute z-10 flex flex-col overflow-hidden border transition-all duration-500 ease-out motion-reduce:transition-none ${
          panel === "full"
            ? "glass-full inset-x-0 bottom-0 max-h-[100dvh] rounded-t-[2rem] border-border/60 h-[100dvh]"
            : panel === "peek"
              ? "glass-subtitle inset-x-2 bottom-3 max-h-[34vh] rounded-[1.75rem] border-border/40 sm:inset-x-6"
              : "glass-subtitle inset-x-2 bottom-3 max-h-[24vh] rounded-[1.75rem] border-border/40 sm:inset-x-6"
        }`}
      >
        <button
          type="button"
          onClick={() => setPanel(panel === "full" ? "subtitle" : "full")}
          aria-label={panel === "full" ? "Collapse the text" : "Show the whole page"}
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
                  onWord={setWord}
                />
              ))
            ) : (
              <SentenceCard
                sentence={subtitle}
                speaking={Boolean(playing && spoken)}
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
              aria-label="Previous page"
              className="press inline-flex items-center gap-1 rounded-2xl bg-secondary px-4 py-2.5 font-bold text-secondary-foreground disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Page {page + 1} of {pages.length}
            </p>
            {isLast ? (
              <Link
                to="/book/$bookId/chapter/$n/quiz"
                params={{ bookId, n }}
                onClick={() => stopAudio()}
                className="press inline-flex items-center gap-1 rounded-2xl bg-primary px-4 py-2.5 font-bold text-primary-foreground"
              >
                Quiz <ChevronRight className="h-5 w-5" />
              </Link>
            ) : (
              <button
                onClick={() => go(1)}
                className="press inline-flex items-center gap-1 rounded-2xl bg-primary px-4 py-2.5 font-bold text-primary-foreground"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </nav>
        ) : (
          <nav className="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-2 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
            <button
              onClick={() => go(-1)}
              disabled={page === 0}
              aria-label="Previous page"
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
                aria-label="Go to the quiz"
                className="press inline-flex h-9 items-center gap-1 rounded-full bg-primary px-3 text-sm font-bold text-primary-foreground"
              >
                Quiz <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <button
                onClick={() => go(1)}
                aria-label="Next page"
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

function SentenceCard({
  sentence,
  speaking,
  onWord,
}: {
  sentence: Sentence;
  speaking: boolean;
  onWord: (word: Word) => void;
}) {
  return (
    <article
      className={`rounded-3xl border p-4 transition-colors ${
        speaking
          ? "border-gold/70 bg-card animate-[speak_1.2s_ease-in-out_infinite]"
          : "border-border/70 bg-card/70"
      }`}
    >
      <div className="flex flex-wrap items-end gap-x-1 gap-y-2">
        {sentence.words.length > 0
          ? sentence.words.map((w, i) => (
              <button
                key={`${w.hanzi}-${i}`}
                onClick={() => onWord(w)}
                className="press rounded-xl px-1 py-0.5 text-left hover:bg-secondary"
              >
                <span className="block text-xs text-primary">{w.pinyin}</span>
                <span className="han block text-3xl font-bold leading-tight text-sand">
                  {w.hanzi}
                </span>
              </button>
            ))
          : (
              <div>
                <span className="block text-xs text-primary">{sentence.pinyin}</span>
                <span className="han block text-3xl font-bold text-sand">{sentence.hanzi}</span>
              </div>
            )}
      </div>
      <p className="mt-2 text-sm text-primary/90">{sentence.pinyin}</p>
      <p className="mt-1 text-base text-muted-foreground">{sentence.native}</p>
      <button
        onClick={() => void speak(sentence.hanzi)}
        className="press mt-3 inline-flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-bold text-secondary-foreground"
      >
        <Play className="h-4 w-4" /> Hear this line
      </button>
    </article>
  );
}
