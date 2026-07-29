import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function StarRow({
  count,
  total = 3,
  size = 18,
  animate = false,
}: {
  count: number;
  total?: number;
  size?: number;
  animate?: boolean;
}) {
  return (
    <div className="flex items-center gap-1" aria-label={`${count} of ${total} stars`}>
      {Array.from({ length: total }).map((_, i) => {
        const earned = i < count;
        return (
          <Star
            key={i}
            width={size}
            height={size}
            strokeWidth={2}
            className={cn(
              earned ? "fill-gold text-gold" : "fill-transparent text-muted-foreground/50",
              animate && earned && "animate-[pop_0.45s_cubic-bezier(0.34,1.8,0.64,1)_both]",
            )}
            style={animate && earned ? { animationDelay: `${i * 140}ms` } : undefined}
          />
        );
      })}
    </div>
  );
}
