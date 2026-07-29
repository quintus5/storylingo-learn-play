import { useEffect, useState } from "react";
import { onSpeakingChange } from "@/lib/audio";

/** Text currently being spoken, for the pulse animation. */
export function useSpeakingText() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => onSpeakingChange(setText), []);
  return text;
}
