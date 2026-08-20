import { Download, X } from "lucide-react";
import { useInstallPrompt } from "@/lib/pwa";
import { useT } from "@/lib/i18n";

/**
 * The one-time "add to your home screen" banner.
 *
 * Android/Chrome gets a real install button; iOS Safari never exposes a
 * programmatic install, so it gets the manual steps instead. Dismissing
 * either is remembered, so this asks once, not on every visit.
 */
export function InstallPrompt() {
  const t = useT();
  const { visible, ios, promptInstall, dismiss } = useInstallPrompt();
  if (!visible) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center p-3 sm:justify-end sm:pr-4"
    >
      <div className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-[0_18px_40px_-18px_oklch(0_0_0/0.75)] backdrop-blur">
        <span className="text-2xl" aria-hidden>
          🌙
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-bold">{t("Add StoryLingo to your home screen", "เพิ่ม StoryLingo ไว้ที่หน้าจอหลัก")}</p>
          <p className="mt-0.5 text-muted-foreground">
            {ios
              ? t(
                  "Tap the Share icon, then “Add to Home Screen”.",
                  "แตะไอคอนแชร์ แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”",
                )
              : t("Opens like an app, and works offline for books you've read.", "เปิดได้เหมือนแอป และอ่านออฟไลน์ได้สำหรับบทที่เคยอ่านแล้ว")}
          </p>
          {!ios && (
            <button
              onClick={() => void promptInstall()}
              className="press mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
            >
              <Download className="h-3.5 w-3.5" /> {t("Install", "ติดตั้ง")}
            </button>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label={t("Dismiss", "ปิด")}
          className="press inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
