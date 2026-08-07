import { useEffect, useState } from "react";
import { VolumeX } from "lucide-react";
import { onAudioFailure, unlockAudio } from "@/lib/audio";
import { useT } from "@/lib/i18n";

/**
 * A quiet, child-friendly notice when a clip can't be played, so silence
 * never looks like a broken tap.
 */
export function AudioFailureToast() {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onAudioFailure(() => {
      setVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 4000);
    });

    // iOS only allows audio that starts inside a tap, so arm the player on
    // the very first touch anywhere in the app.
    const arm = () => unlockAudio();
    window.addEventListener("pointerdown", arm, { once: true, capture: true });

    return () => {
      off();
      clearTimeout(timer);
      window.removeEventListener("pointerdown", arm, { capture: true });
    };
  }, []);


  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
    >
      <p className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-sm font-semibold shadow-lg">
        <VolumeX className="h-4 w-4 text-primary" />
        {t("The voice is having a rest. Tap again in a moment.", "เสียงพักอยู่ แตะอีกครั้งในอีกสักครู่นะ")}
      </p>
    </div>
  );
}
