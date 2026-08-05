import { useEffect, useState } from "react";
import { getVoice, onVoiceChange, setVoice, type VoiceId } from "@/lib/audio";

/**
 * Selected narrator voice, shared across the app.
 * Starts at the SSR-safe default and syncs to the stored choice after mount.
 */
export function useVoice(): [VoiceId, (v: VoiceId) => void] {
  const [voice, setLocal] = useState<VoiceId>("female");
  useEffect(() => onVoiceChange(setLocal), []);
  return [voice, setVoice];
}
