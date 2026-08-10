import { useEffect, useRef, useState } from "react";
import { X, Volume2, PenLine } from "lucide-react";
import type { Word } from "@/lib/types";
import { speak, stopAudio } from "@/lib/audio";
import { useT } from "@/lib/i18n";
import { normalizePinyin } from "@/lib/pinyin";
import { StrokeWriter } from "@/components/StrokeWriter";
import { useWritableChars } from "@/hooks/use-writable";

export function WordPopup({ word, onClose }: { word: Word; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const t = useT();
  const [writing, setWriting] = useState(false);
  const chars = useWritableChars([word]);


  useEffect(() => {
    void speak(word.hanzi, true);
  }, [word.hanzi]);

  // Stop the narration when the card closes, so it doesn't talk over the page.
  useEffect(() => () => stopAudio(), []);

  // Move focus into the card and keep Tab inside it while it is open.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
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
            <p className="mt-1 text-lg font-semibold text-primary">{normalizePinyin(word.pinyin, word.hanzi)}</p>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label={t("Close", "ปิด")}
            className="press inline-flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
          >
            <X className="h-5 w-5" />
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

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void speak(word.hanzi, true)}
            className="press inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 font-bold text-primary-foreground"
          >
            <Volume2 className="h-5 w-5" /> {t("Hear it slowly", "ฟังทีละคำช้าๆ")}
          </button>
          {/* Only offered when this word really has stroke data to practise. */}
          {chars.length > 0 && (
            <button
              onClick={() => {
                stopAudio();
                setWriting(true);
              }}
              className="press inline-flex items-center justify-center gap-2 rounded-2xl bg-secondary px-4 py-3 font-bold text-secondary-foreground"
            >
              <PenLine className="h-5 w-5" /> {t("Write it", "หัดเขียน")}
            </button>
          )}
        </div>
      </div>

      {writing && (
        <StrokeWriter
          targets={chars.map((hanzi) => ({
            hanzi,
            pinyin: chars.length === 1 ? word.pinyin : undefined,
            dict: chars.length === 1 ? word.dict : undefined,
          }))}
          onClose={() => setWriting(false)}
        />
      )}
    </div>
  );

}
