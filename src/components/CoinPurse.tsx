import { Link } from "@tanstack/react-router";
import { formatCoins } from "@/lib/economy";
import { useProgress } from "@/lib/progress";

/** The coin purse pill shown in the header; tapping it opens the shop. */
export function CoinPurse({ coins }: { coins?: number }) {
  const { progress } = useProgress();
  const value = coins ?? progress.coins;

  return (
    <Link
      to="/shop"
      className="press inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-2 text-sm font-extrabold text-secondary-foreground"
      aria-label={`${value} coins. Open the shop.`}
    >
      <span className="text-base" aria-hidden>
        🪙
      </span>
      {formatCoins(value)}
    </Link>
  );
}
