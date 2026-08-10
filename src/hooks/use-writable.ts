import { useEffect, useState } from "react";
import { keepWritable, writableChars } from "@/lib/hanzi-data";

/**
 * The characters in these words that really do have stroke data, so the
 * "Write it" buttons only appear when there is something to practise.
 */
export function useWritableChars(words: { hanzi: string }[]) {
  const key = words.map((w) => w.hanzi).join("");
  const [chars, setChars] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const candidates = writableChars(words);
    if (candidates.length === 0) {
      setChars([]);
      return;
    }
    void keepWritable(candidates).then((ok) => {
      if (!cancelled) setChars(ok);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return chars;
}
