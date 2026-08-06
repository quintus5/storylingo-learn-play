import { useEffect, useRef } from "react";
import { X, Volume2 } from "lucide-react";
import type { Word } from "@/lib/types";
import { speak } from "@/lib/audio";
import { useT } from "@/lib/i18n";

export function WordPopup({ word, onClose }: { word: Word; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    void speak(word.hanzi, true);
  }, [word.hanzi]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (!panelRef.current?.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t(`Word ${word.hanzi}`, `คำว่า ${word.hanzi}`)}
        className="w-full max-w-md animate-[float-in_0.28s_ease-out_both] rounded-3xl border border-primary/30 bg-card p-5 shadow-[0_18px_40px_-18px_oklch(0_0_0/0.75)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="han text-5xl font-bold leading-tight text-sand">{word.hanzi}</p>
            <p className="mt-1 text-lg font-semibold text-primary">{word.pinyin}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("Close", "ปิด")}
            className="press inline-flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="mt-4 space-y-3">
          <div className="rounded-2xl bg-secondary/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("Dictionary meaning", "ความหมายในพจนานุกรม")}
            </dt>
            <dd className="mt-1 text-base text-foreground">{word.dict}</dd>
          </div>
          {word.context ? (
            <div className="rounded-2xl bg-secondary/40 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("In this sentence", "ในประโยคนี้")}
              </dt>
              <dd className="mt-1 text-base text-foreground">{word.context}</dd>
            </div>
          ) : null}
        </dl>

        <button
          onClick={() => void speak(word.hanzi, true)}
          className="press mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 font-bold text-primary-foreground"
        >
          <Volume2 className="h-5 w-5" /> {t("Hear it slowly", "ฟังทีละคำช้าๆ")}
        </button>
      </div>
    </div>
  );
}
