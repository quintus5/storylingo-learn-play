import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Music, Pause, Play, VolumeX } from "lucide-react";
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


  return (
    <AppShell
      title={`Ch. ${idx} · ${chapter.title}`}
      back={{ to: "/book/$bookId", params: { bookId } }}
      right={
        <div className="flex items-center gap-2">
        <button
          onClick={() => {
            chooseVoice(voice === "female" ? "male" : "female");
            setPlaying(false);
          }}
          aria-label={`Narrator: ${voice === "female" ? "female" : "male"}. Tap to switch.`}
          title="Switch narrator"
          className="press inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-2 text-sm font-bold text-secondary-foreground"
        >
          <span aria-hidden>{voice === "female" ? "👩" : "👨"}</span>
          <span className="hidden sm:inline">{voice === "female" ? "Female" : "Male"}</span>
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
          className="press inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-2 text-sm font-bold text-secondary-foreground"
        >
          {music ? <Music className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          <span className="hidden sm:inline">Music</span>
        </button>
        <button
          onClick={() => void playPage()}
          className="press inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Stop" : "Read to me"}
        </button>
        </div>
      }
    >
      {(current.image_url || (page === 0 && chapter.image_url)) && (
        <div className="sticky top-[3.75rem] z-10 -mx-4 mb-5 bg-background px-4 pb-4 pt-3 sm:top-[4rem]">
          <img
            key={current.image_url ?? chapter.image_url ?? "cover"}
            src={current.image_url ?? chapter.image_url ?? undefined}
            alt={`Illustration for ${chapter.title}, page ${page + 1}`}
            className={`h-40 w-full rounded-3xl object-cover shadow-lg sm:h-64 md:h-80 ${
              dir > 0 ? "animate-[page-in-next_.42s_cubic-bezier(.22,.8,.3,1)_both]" : "animate-[page-in-prev_.42s_cubic-bezier(.22,.8,.3,1)_both]"
            }`}
          />
        </div>
      )}


      <div
        key={page}
        className={`space-y-4 ${
          dir > 0
            ? "animate-[page-in-next_.4s_cubic-bezier(.22,.8,.3,1)_both]"
            : "animate-[page-in-prev_.4s_cubic-bezier(.22,.8,.3,1)_both]"
        }`}
      >
        {current.sentences.map((sentence, i) => (
          <SentenceCard
            key={i}
            sentence={sentence}
            speaking={speaking === sentence.hanzi}
            onWord={setWord}
          />
        ))}
      </div>

      <nav className="mt-8 flex items-center justify-between gap-3">
        <button
          onClick={() => go(-1)}
          disabled={page === 0}
          className="press inline-flex items-center gap-1 rounded-2xl bg-secondary px-4 py-3 font-bold text-secondary-foreground disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" /> Back
        </button>
        <p className="text-sm text-muted-foreground">
          Page {page + 1} of {pages.length}
        </p>
        {isLast ? (
          <Link
            to="/book/$bookId/chapter/$n/quiz"
            params={{ bookId, n }}
            onClick={() => stopAudio()}
            className="press inline-flex items-center gap-1 rounded-2xl bg-primary px-4 py-3 font-bold text-primary-foreground"
          >
            Play the quiz <ChevronRight className="h-5 w-5" />
          </Link>
        ) : (
          <button
            onClick={() => go(1)}
            className="press inline-flex items-center gap-1 rounded-2xl bg-primary px-4 py-3 font-bold text-primary-foreground"
          >
            Next <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </nav>

      {word && <WordPopup word={word} onClose={() => setWord(null)} />}
    </AppShell>
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
        speaking ? "border-gold/70 bg-card animate-[speak_1.2s_ease-in-out_infinite]" : "border-border bg-card/80"
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
