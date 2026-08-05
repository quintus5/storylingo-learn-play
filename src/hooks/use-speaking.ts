import { useEffect, useState } from "react";
import { onSpeakingChange, onSpeakingProgress } from "@/lib/audio";

/** Text currently being spoken, for the pulse animation. */
export function useSpeakingText() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => onSpeakingChange(setText), []);
  return text;
}

/** 0..1 progress through the clip currently playing. */
export function useSpeakingProgress() {
  const [p, setP] = useState(0);
  useEffect(() => onSpeakingProgress(setP), []);
  return p;
}
