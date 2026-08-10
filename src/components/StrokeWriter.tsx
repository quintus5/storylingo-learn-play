import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, SkipForward, Volume2, Sparkles } from "lucide-react";
import { CharacterSprite } from "@/components/CharacterSprite";
import { speak } from "@/lib/audio";
import { charDataLoader, loadCharData } from "@/lib/hanzi-data";
import { useT } from "@/lib/i18n";
import { useProgress } from "@/lib/progress";
import { normalizePinyin } from "@/lib/pinyin";
import { REWARDS } from "@/lib/economy";

/** One character to practise, with the word info we show above the box. */
export type WriteTarget = { hanzi: string; pinyin?: string; dict?: string };

type Stage = "watch" | "trace" | "try" | "done";

const SIZE = 260;

function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** Soft click when a stroke lands. Cheap enough to make on the spot. */
let clickCtx: AudioContext | null = null;
function clickSound() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    clickCtx = clickCtx ?? new Ctor();
    const ctx = clickCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    /* sound is a nicety, never a blocker */
  }
}

/** 米字格 guide box the way children learn to write on paper. */
function RiceGrid() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <rect x="1" y="1" width="98" height="98" rx="4" className="fill-none stroke-primary/40" strokeWidth="1" />
      <g className="stroke-primary/25" strokeWidth="0.8" strokeDasharray="4 4">
        <line x1="50" y1="1" x2="50" y2="99" />
        <line x1="1" y1="50" x2="99" y2="50" />
        <line x1="1" y1="1" x2="99" y2="99" />
        <line x1="99" y1="1" x2="1" y2="99" />
      </g>
    </svg>
  );
}

type Splash = { id: number; x: number; y: number };

/**
 * Stroke-by-stroke writing practice: watch the character paint itself, trace
 * it over a faded outline, then write it from memory. Nothing here can be
 * failed — a missed stroke only wobbles and offers a hint.
 */
export function StrokeWriter({
  targets,
  onClose,
  bonusKey,
  title,
  sentence,
}: {
  targets: WriteTarget[];
  onClose: () => void;
  /** When given, a one-off bonus is paid for finishing every character. */
  bonusKey?: string;
  title?: string;
  /** The whole line being practised, shown across the top for context. */
  sentence?: { chars: string[]; native?: string };
}) {
  const t = useT();
  const { progress, writeChar, finishWritingSet } = useProgress();
  const boxRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<{ animateCharacter: (o?: unknown) => void; quiz: (o?: unknown) => void; cancelQuiz?: () => void; hideCharacter?: () => void; showOutline?: () => void; hideOutline?: () => void } | null>(null);

  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>("watch");
  const [strokes, setStrokes] = useState({ done: 0, total: 0 });
  const [wobble, setWobble] = useState(0);
  const [nudge, setNudge] = useState<string | null>(null);
  const [splashes, setSplashes] = useState<Splash[]>([]);
  const [celebrate, setCelebrate] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  /** Characters finished during this session, by target index. */
  const [doneIdx, setDoneIdx] = useState<number[]>([]);

  const target = targets[index];
  const indexRef = useRef(index);
  indexRef.current = index;
  const soft = reducedMotion();
  const written = useMemo(() => new Set(progress.charsWritten), [progress.charsWritten]);

  const next = useCallback(() => {
    setCelebrate(false);
    setNudge(null);
    if (index + 1 >= targets.length) {
      if (bonusKey) finishWritingSet(bonusKey);
      onClose();
      return;
    }
    setIndex((i) => i + 1);
    setStage("watch");
  }, [index, targets.length, bonusKey, finishWritingSet, onClose]);

  // Escape always gets out — this is practice, never a trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Build (or rebuild) the writer whenever the character or the stage changes.
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setUnavailable(false);
    setStrokes({ done: 0, total: 0 });

    void (async () => {
      const data = (await loadCharData(target.hanzi)) as { strokes?: string[] } | null;
      if (cancelled) return;
      if (!data) {
        setUnavailable(true);
        return;
      }
      setStrokes({ done: 0, total: data.strokes?.length ?? 0 });

      const { default: HanziWriter } = await import("hanzi-writer");
      if (cancelled || !boxRef.current) return;
      boxRef.current.innerHTML = "";

      const writer = HanziWriter.create(boxRef.current, target.hanzi, {
        width: SIZE,
        height: SIZE,
        padding: 14,
        showCharacter: false,
        showOutline: stage !== "try",
        strokeAnimationSpeed: soft ? 3 : 0.7,
        delayBetweenStrokes: soft ? 120 : 620,
        strokeColor: "#f2c14e",
        outlineColor: "#8a8578",
        drawingColor: "#f2c14e",
        highlightColor: "#7fb3ff",
        charDataLoader,
        onLoadCharDataError: () => setUnavailable(true),
      } as never) as unknown as typeof writerRef.current;
      writerRef.current = writer;
      if (!writer) return;

      if (stage === "watch") {
        void speak(target.hanzi, true);
        writer.animateCharacter({
          onComplete: () => {
            if (!cancelled) setStage("trace");
          },
        });
        return;
      }

      if (stage === "trace" || stage === "try") {
        writer.quiz({
          showHintAfterMisses: stage === "trace" ? 1 : 2,
          leniency: stage === "trace" ? 1.4 : 1.1,
          onCorrectStroke: (info: { strokesRemaining: number; drawnPath?: { points?: { x: number; y: number }[] } }) => {
            clickSound();
            setStrokes((s) => ({ ...s, done: s.total - info.strokesRemaining }));
            const pts = info.drawnPath?.points;
            const last = pts?.[pts.length - 1];
            if (last) {
              const id = Date.now() + Math.random();
              setSplashes((list) => [...list, { id, x: last.x, y: last.y }]);
              window.setTimeout(
                () => setSplashes((list) => list.filter((s) => s.id !== id)),
                600,
              );
            }
          },
          onMistake: () => {
            setWobble((w) => w + 1);
            setNudge(t("Almost — try that stroke again.", "เกือบแล้ว ลองเส้นนี้อีกครั้ง"));
          },
          onComplete: () => {
            if (cancelled) return;
            if (stage === "trace") {
              setNudge(null);
              setStage("try");
              return;
            }
            setStage("done");
            setCelebrate(true);
            setDoneIdx((list) =>
              list.includes(indexRef.current) ? list : [...list, indexRef.current],
            );
            writeChar(target.hanzi);
            void speak(target.hanzi, true);
          },
        });
      }
    })();

    return () => {
      cancelled = true;
      try {
        writerRef.current?.cancelQuiz?.();
      } catch {
        /* already gone */
      }
      writerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.hanzi, stage]);

  if (!target) return null;

  const stageLabel =
    stage === "watch"
      ? t("Watch", "ดูก่อน")
      : stage === "trace"
        ? t("Trace it", "เขียนตาม")
        : stage === "try"
          ? t("Try it yourself", "ลองเขียนเอง")
          : t("Great job!", "เก่งมาก!");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/75 p-3 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(`Write ${target.hanzi}`, `เขียน ${target.hanzi}`)}
        className="glass-full w-full max-w-lg animate-[float-in_0.28s_ease-out_both] rounded-3xl border border-primary/30 p-4 shadow-[0_18px_40px_-18px_oklch(0_0_0/0.75)]"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              {title ?? t("Write it", "หัดเขียน")} · {stageLabel}
            </p>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {target.pinyin ? normalizePinyin(target.pinyin, target.hanzi) : ""}
              {target.dict ? ` · ${target.dict}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("Close", "ปิด")}
            className="press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* The whole line, so the meaning of what you are writing stays visible. */}
        {sentence && sentence.chars.length > 0 && (
          <div className="mt-3 rounded-2xl bg-secondary/30 px-3 py-2">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {sentence.chars.map((ch, i) => {
                const isNow = i === index;
                const isDone = doneIdx.includes(i);
                return (
                  <span
                    key={`${ch}-${i}`}
                    className={`han relative inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-1.5 text-xl font-bold transition-colors duration-200 motion-reduce:transition-none ${
                      isNow
                        ? "bg-gold/20 text-gold ring-1 ring-gold/60"
                        : isDone
                          ? "bg-gold/10 text-gold"
                          : "text-muted-foreground/60"
                    }`}
                  >
                    {ch}
                    {isDone && !isNow && (
                      <span className="absolute -right-0.5 -top-1 text-[10px] leading-none">✓</span>
                    )}
                  </span>
                );
              })}
            </div>
            {sentence.native && (
              <p className="mt-1 text-center text-xs text-muted-foreground">{sentence.native}</p>
            )}
          </div>
        )}



        <div className="mt-3 flex items-center gap-3">
          {/* The buddy cheers from the side of the card. */}
          {progress.character && (
            <div
              className={`hidden shrink-0 sm:block ${
                celebrate && !soft ? "animate-[buddy-cheer_.8s_ease-out_2]" : ""
              }`}
            >
              <CharacterSprite look={progress.character} size={88} />
            </div>
          )}

          <div className="relative mx-auto">
            <div
              key={wobble}
              className={`relative rounded-2xl bg-secondary/40 ${
                wobble && !soft ? "animate-[wobble_.35s_ease-in-out]" : ""
              }`}
              style={{ width: SIZE, height: SIZE }}
            >
              <RiceGrid />
              <div ref={boxRef} className="relative" aria-hidden />

              {splashes.map((s) => (
                <span
                  key={s.id}
                  className="pointer-events-none absolute h-3 w-3 rounded-full bg-gold animate-[ink-pop_.6s_ease-out_forwards]"
                  style={{ left: s.x - 6, top: s.y - 6 }}
                />
              ))}

              {celebrate && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <span
                      key={i}
                      className="absolute h-2 w-2 rounded-full bg-gold animate-[star-burst_.9s_ease-out_forwards]"
                      style={{
                        // Each speck flies out along its own angle.
                        ["--bx" as string]: `${Math.cos((i / 10) * Math.PI * 2) * 90}px`,
                        ["--by" as string]: `${Math.sin((i / 10) * Math.PI * 2) * 90}px`,
                      }}
                    />
                  ))}
                </span>
              )}

              {unavailable && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-card/90 p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "This character has no writing lesson yet.",
                      "ตัวอักษรนี้ยังไม่มีบทเรียนการเขียน",
                    )}
                  </p>
                  <button
                    onClick={next}
                    className="press rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                  >
                    {t("Next", "ถัดไป")}
                  </button>
                </div>
              )}
            </div>

            <p
              className={`han mt-2 text-center text-3xl font-bold ${
                celebrate ? "text-gold animate-[gold-pulse_.9s_ease-out_2]" : "text-sand"
              }`}
            >
              {target.hanzi}
              {written.has(target.hanzi) && <span className="ml-2 align-middle text-sm">⭐</span>}
            </p>
          </div>
        </div>

        {/* Stroke dots, same shape as the sentence dots in the reader. */}
        {strokes.total > 0 && (
          <div className="mt-3 flex items-center justify-center gap-1">
            {Array.from({ length: strokes.total }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none ${
                  i < strokes.done ? "w-4 bg-gold" : "w-1.5 bg-muted-foreground/40"
                }`}
              />
            ))}
          </div>
        )}

        <p className="mt-2 min-h-5 text-center text-xs text-muted-foreground">
          {celebrate
            ? t(`Great job! +${REWARDS.character} coins`, `เก่งมาก! +${REWARDS.character} เหรียญ`)
            : (nudge ??
              (stage === "watch"
                ? t("Watch how it is written.", "ดูวิธีเขียนก่อนนะ")
                : stage === "trace"
                  ? t("Trace over the grey lines.", "ลากตามเส้นสีเทา")
                  : t("Now write it from memory.", "ตอนนี้ลองเขียนเอง")))}
        </p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            onClick={() => void speak(target.hanzi, true)}
            className="press inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-2 text-xs font-bold text-secondary-foreground"
          >
            <Volume2 className="h-4 w-4" /> {t("Hear it", "ฟังเสียง")}
          </button>

          <p className="text-xs text-muted-foreground">
            {t(`${index + 1} of ${targets.length}`, `${index + 1} จาก ${targets.length}`)}
          </p>

          <button
            onClick={next}
            className={`press inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold ${
              stage === "done"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            }`}
          >
            {stage === "done" ? <Sparkles className="h-4 w-4" /> : <SkipForward className="h-4 w-4" />}
            {index + 1 >= targets.length
              ? t("Finish", "จบรอบ")
              : stage === "done"
                ? t("Next character", "ตัวถัดไป")
                : t("Skip", "ข้าม")}
          </button>
        </div>
      </div>
    </div>
  );
}
