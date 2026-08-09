import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Play, Sparkles, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StarRow } from "@/components/StarRow";
import { bookQuery } from "@/lib/books";
import { useProgress } from "@/lib/progress";
import { preload, speak, stopAudio } from "@/lib/audio";
import type { Word } from "@/lib/types";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/book/$bookId/chapter/$n/quiz")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(bookQuery(params.bookId)),
  head: ({ params }) => {
    const title = `Chapter ${params.n} quiz — StoryLingo`;
    return {
      meta: [
        { title },
        {
          name: "description",
          content: "Matching, listening and translation rounds to unlock the next chapter.",
        },
        { property: "og:title", content: title },
        {
          property: "og:description",
          content: "Play three quick rounds to earn stars and unlock the next chapter.",
        },
      ],
    };
  },
  component: Quiz,
  errorComponent: () => (
    <AppShell>
      <p className="text-muted-foreground">{useT()("The quiz could not be loaded.", "ไม่สามารถโหลดแบบทดสอบได้")}</p>
    </AppShell>
  ),
});

type Question =
  | { kind: "match"; prompt: Word; options: Word[] }
  | { kind: "listen"; prompt: Word; options: Word[] }
  | { kind: "translate"; prompt: Word; options: Word[] };

function useRoundLabel(t: ReturnType<typeof useT>): Record<Question["kind"], string> {
  return {
    match: t("Round 1 · Match the word", "รอบที่ 1 · จับคู่คำศัพท์"),
    listen: t("Round 2 · Listen and choose", "รอบที่ 2 · ฟังแล้วเลือก"),
    translate: t("Round 3 · Say it in Mandarin", "รอบที่ 3 · พูดเป็นภาษาจีน"),
  };
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function Quiz() {
  const t = useT();
  const ROUND_LABEL = useRoundLabel(t);
  const { bookId, n } = Route.useParams();
  const idx = Number(n);
  const { data } = useSuspenseQuery(bookQuery(bookId));
  const navigate = useNavigate();
  const { progress, awardStars, missWord, masterWord } = useProgress();
  const coinsAtStart = useRef<number | null>(null);

  const chapter = data.chapters.find((c) => c.idx === idx);
  const learned = useMemo(
    () =>
      data.chapters
        .filter((c) => c.idx < idx)
        .flatMap((c) => c.words ?? [])
        .filter((w) => w.hanzi),
    [data.chapters, idx],
  );

  const questions = useMemo<Question[]>(() => {
    const words = (chapter?.words ?? []).filter((w) => w.hanzi && w.dict);
    if (words.length < 2) return [];

    // One entry per character, so the same word can't appear twice as an option.
    const pool: Word[] = [];
    const seen = new Set<string>();
    for (const w of [...words, ...learned]) {
      if (!w.hanzi || !w.dict || seen.has(w.hanzi)) continue;
      seen.add(w.hanzi);
      pool.push(w);
    }

    const norm = (s: string) => s.trim().toLowerCase();

    const pick = (answer: Word) => {
      // Skip look-alike answers: a distractor meaning the same thing has no
      // right answer from the child's point of view.
      const distractors = shuffle(
        pool.filter((w) => w.hanzi !== answer.hanzi && norm(w.dict) !== norm(answer.dict)),
      ).slice(0, 3);
      return shuffle([answer, ...distractors]);
    };

    const chosen = shuffle(words.filter((w, i, list) => list.findIndex((o) => o.hanzi === w.hanzi) === i));
    /** Take `count` words starting at `offset`, wrapping when the list is short. */
    const round = (kind: Question["kind"], count: number, offset: number) =>
      Array.from({ length: Math.min(count, chosen.length) }, (_, k) => {
        const w = chosen[(offset + k) % chosen.length];
        return { kind, prompt: w, options: pick(w) } as Question;
      });

    return [
      ...round("match", 4, 0),
      ...round("listen", 3, 4),
      ...round("translate", 3, 7),
    ].filter((q) => q.options.length > 1);
  }, [chapter?.id, learned]);


  const [started, setStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => () => stopAudio(), []);

  useEffect(() => {
    if (chapter) preload([], (chapter.words ?? []).map((w) => w.hanzi));
  }, [chapter?.id]);

  const question = questions[step];

  useEffect(() => {
    // Always cut off whatever was playing for the previous question.
    stopAudio();
    if (started && question?.kind === "listen") void speak(question.prompt.hanzi, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, step]);

  if (!chapter || questions.length === 0) {
    return (
      <AppShell back={{ to: "/book/$bookId", params: { bookId } }}>
        <p className="text-muted-foreground">{t("This chapter has no quiz words yet.", "บทนี้ยังไม่มีคำศัพท์สำหรับทำแบบทดสอบ")}</p>
      </AppShell>
    );
  }

  const stars = (() => {
    const ratio = correct / questions.length;
    if (ratio >= 0.9) return 3;
    if (ratio >= 0.7) return 2;
    if (ratio >= 0.5) return 1;
    return 0;
  })();

  function answer(option: Word) {
    if (picked || !question) return;
    setPicked(option.hanzi);
    const right = option.hanzi === question.prompt.hanzi;
    // Records the tone bucket and the round kind, not just right/wrong.
    recordAnswer(question.prompt, question.kind, right);
    if (right) {
      setCorrect((c) => c + 1);
      void speak(question.prompt.hanzi);
    }
    setTimeout(() => {
      setPicked(null);
      if (step + 1 >= questions.length) {
        setDone(true);
      } else {
        setStep((s) => s + 1);
      }
    }, 900);
  }

  useEffect(() => {
    if (coinsAtStart.current === null && started) coinsAtStart.current = progress.coins;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const coinsWon = Math.max(0, progress.coins - (coinsAtStart.current ?? progress.coins));

  useEffect(() => {
    if (done) awardStars(bookId, idx, Math.max(stars, 1) === 1 && stars === 0 ? 0 : stars);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (!started) {
    return (
      <AppShell title={t("Warm-up", "อุ่นเครื่อง")} back={{ to: "/book/$bookId/chapter/$n", params: { bookId, n } }}>
        <div className="mx-auto max-w-md rounded-3xl border border-primary/25 bg-card p-6 text-center">
          <p className="text-4xl" aria-hidden>
            🐫
          </p>
          <h2 className="mt-3 text-2xl font-extrabold">{t(`Ready for chapter ${idx}?`, `พร้อมสำหรับบทที่ ${idx} หรือยัง?`)}</h2>
          <p className="mt-2 text-muted-foreground">
            {t(
              "Three quick rounds: match the words, listen carefully, then choose the Mandarin.",
              "สามรอบสั้นๆ: จับคู่คำศัพท์ ตั้งใจฟัง แล้วเลือกคำภาษาจีนให้ถูกต้อง",
            )}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {(chapter.words ?? []).slice(0, 6).map((w) => (
              <button
                key={w.hanzi}
                onClick={() => void speak(w.hanzi, true)}
                className="press rounded-2xl bg-secondary px-3 py-2 text-left"
              >
                <span className="han block text-xl font-bold text-sand">{w.hanzi}</span>
                <span className="block text-xs text-primary">{w.pinyin}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setStarted(true)}
            className="press mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-lg font-extrabold text-primary-foreground"
          >
            <Sparkles className="h-5 w-5" /> {t("Start the quiz", "เริ่มทำแบบทดสอบ")}
          </button>
        </div>
      </AppShell>
    );
  }

  if (done) {
    const nextIdx = idx + 1;
    const hasNext = data.chapters.some((c) => c.idx === nextIdx && (c.pages?.length ?? 0) > 0);
    return (
      <AppShell title={t("Well done!", "เก่งมาก!")} back={{ to: "/book/$bookId", params: { bookId } }}>
        <div className="mx-auto max-w-md rounded-3xl border border-gold/40 bg-card p-6 text-center">
          <p className="text-5xl animate-[boing_0.7s_ease-out]" aria-hidden>
            🌟
          </p>
          <h2 className="mt-3 text-2xl font-extrabold">
            {t(`${correct} / ${questions.length} correct`, `ถูก ${correct} / ${questions.length} ข้อ`)}
          </h2>
          <div className="mt-3 flex justify-center">
            <StarRow count={stars} animate />
          </div>
          {coinsWon > 0 && (
            <p className="mt-3 animate-[pop_0.5s_ease-out] text-lg font-extrabold text-gold">
              🪙 +{coinsWon} {t("coins", "เหรียญ")}
            </p>
          )}
          <p className="mt-3 text-muted-foreground">
            {stars > 0
              ? t("The next chapter is unlocked!", "ปลดล็อกบทถัดไปแล้ว!")
              : t(
                  "Read the chapter again and try once more to unlock the next one.",
                  "อ่านบทนี้อีกครั้งแล้วลองใหม่เพื่อปลดล็อกบทถัดไป",
                )}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {stars > 0 && hasNext && (
              <Link
                to="/book/$bookId/chapter/$n"
                params={{ bookId, n: String(nextIdx) }}
                className="press rounded-2xl bg-primary px-5 py-3 font-extrabold text-primary-foreground"
              >
                {t(`Read chapter ${nextIdx}`, `อ่านบทที่ ${nextIdx}`)}
              </Link>
            )}
            <button
              onClick={() => {
                setStep(0);
                setCorrect(0);
                setDone(false);
                setStarted(false);
              }}
              className="press rounded-2xl bg-secondary px-5 py-3 font-bold text-secondary-foreground"
            >
              {t("Play again", "เล่นอีกครั้ง")}
            </button>
            <button
              onClick={() => void navigate({ to: "/book/$bookId", params: { bookId } })}
              className="press rounded-2xl border border-border px-5 py-3 font-bold"
            >
              {t("Back to the book", "กลับไปที่หนังสือ")}
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={ROUND_LABEL[question.kind]} back={{ to: "/book/$bookId", params: { bookId } }}>
      <div className="mx-auto max-w-md">
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gold transition-all"
            style={{ width: `${(step / questions.length) * 100}%` }}
          />
        </div>

        <div className="mt-6 rounded-3xl border border-border bg-card p-6 text-center">
          {question.kind === "match" && (
            <>
              <p className="han text-5xl font-bold text-sand">{question.prompt.hanzi}</p>
              <p className="mt-1 text-primary">{question.prompt.pinyin}</p>
              <p className="mt-3 text-sm text-muted-foreground">{t("Which meaning is right?", "ความหมายไหนถูกต้อง?")}</p>
            </>
          )}
          {question.kind === "listen" && (
            <>
              <button
                onClick={() => void speak(question.prompt.hanzi, true)}
                className="press inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-4 font-extrabold text-primary-foreground"
              >
                <Play className="h-5 w-5" /> {t("Play again", "เล่นอีกครั้ง")}
              </button>
              <p className="mt-3 text-sm text-muted-foreground">{t("Which word did you hear?", "คุณได้ยินคำไหน?")}</p>
            </>
          )}
          {question.kind === "translate" && (
            <>
              <p className="text-2xl font-bold">{question.prompt.dict}</p>
              <p className="mt-3 text-sm text-muted-foreground">{t("Choose the Mandarin word.", "เลือกคำภาษาจีนที่ถูกต้อง")}</p>
            </>
          )}
        </div>

        <div className="mt-5 grid gap-3">
          {question.options.map((option) => {
            const isAnswer = option.hanzi === question.prompt.hanzi;
            const chosen = picked === option.hanzi;
            const state = !picked
              ? "border-border bg-card"
              : isAnswer
                ? "border-gold bg-gold/15"
                : chosen
                  ? "border-destructive bg-destructive/10 animate-[shake_0.4s_ease-in-out]"
                  : "border-border bg-card opacity-60";
            return (
              <button
                key={option.hanzi}
                onClick={() => answer(option)}
                disabled={!!picked}
                className={`press flex items-center justify-between gap-3 rounded-2xl border p-4 text-left ${state}`}
              >
                {question.kind === "match" ? (
                  <span className="text-base">{option.dict}</span>
                ) : (
                  <span>
                    <span className="han block text-2xl font-bold text-sand">{option.hanzi}</span>
                    <span className="block text-xs text-primary">{option.pinyin}</span>
                  </span>
                )}
                {picked &&
                  (isAnswer ? (
                    <Check className="h-5 w-5 shrink-0 text-gold" />
                  ) : chosen ? (
                    <X className="h-5 w-5 shrink-0 text-destructive" />
                  ) : null)}
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t(`Question ${step + 1} of ${questions.length}`, `ข้อที่ ${step + 1} จาก ${questions.length}`)}
        </p>
      </div>
    </AppShell>
  );
}
