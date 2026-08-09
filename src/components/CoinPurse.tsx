import { Link } from "@tanstack/react-router";
import { formatCoins } from "@/lib/economy";
import { useProgress, useTestUnlock } from "@/lib/progress";
import { useT } from "@/lib/i18n";

/** The coin purse pill shown in the header; tapping it opens the shop. */
export function CoinPurse({ coins }: { coins?: number }) {
  const { progress, loaded } = useProgress();
  const testMode = useTestUnlock();
  const t = useT();
  const value = coins ?? progress.coins;
  // Until the device's purse is read, show a dash rather than a number that
  // would then change in front of the child.
  const ready = coins !== undefined || loaded;

  return (
    <Link
      to="/shop"
      className="press inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-2 text-sm font-extrabold text-secondary-foreground"
      aria-label={
        ready
          ? t(`${value} coins. Open the shop.`, `${value} เหรียญ เปิดร้านค้า`)
          : t("Open the shop", "เปิดร้านค้า")
      }
      title={t(
        "Coins come from quiz stars. Spend them on outfits, hats, pets and new chapters.",
        "เหรียญได้จากดาวในแบบทดสอบ ใช้ซื้อชุด หมวก สัตว์เลี้ยง และบทใหม่",
      )}
    >
      <span className="text-base" aria-hidden>
        🪙
      </span>
      {ready ? formatCoins(value) : "—"}
      {testMode && ready && (
        <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
          {t("test", "ทดสอบ")}
        </span>
      )}
    </Link>
  );
}
