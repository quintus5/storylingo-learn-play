import { useEffect, useState } from "react";
import { keepWritable, writableChars } from "@/lib/hanzi-data";

/** Stable empty result, so callers never see a new array identity per render. */
const NONE: string[] = [];

/**
 * The characters in these words that really do have stroke data, so the
 * "Write it" buttons only appear when there is something to practise.
 */
export function useWritableChars(words: { hanzi: string }[]) {
  const key = words.map((w) => w.hanzi).join("");
  // The key is kept beside the result: while a new lookup is in flight we must
  // report nothing rather than the previous word's characters, or tapping
  // "Write" right after moving on opens the line the reader just left.
  const [state, setState] = useState<{ key: string; chars: string[] }>({
    key: "",
    chars: NONE,
  });

  useEffect(() => {
    let cancelled = false;
    const candidates = writableChars(words);
    if (candidates.length === 0) {
      setState({ key, chars: NONE });
      return;
    }
    void keepWritable(candidates).then((ok) => {
      if (!cancelled) setState({ key, chars: ok });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state.key === key ? state.chars : NONE;
}
