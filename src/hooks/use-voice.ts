import { useEffect, useState } from "react";
import { getVoice, onVoiceChange, setVoice, type VoiceId } from "@/lib/audio";

/** Selected narrator voice, shared across the app. */
export function useVoice(): [VoiceId, (v: VoiceId) => void] {
  const [voice, setLocal] = useState<VoiceId>(getVoice());
  useEffect(() => onVoiceChange(setLocal), []);
  return [voice, setVoice];
}
