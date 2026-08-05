/**
 * Audio: one shared player, IndexedDB clip cache, background preloading.
 * A new request always cancels whatever is currently playing.
 */

const DB_NAME = "storylingo-audio";
const STORE = "clips";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }
  return dbPromise;
}

async function readCache(key: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function writeCache(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

const memory = new Map<string, Blob>();
const inflight = new Map<string, Promise<Blob | null>>();

/** Narrator voices (Fish Audio reference ids). */
export type VoiceId = "male" | "female";
export const VOICE_IDS: Record<VoiceId, string> = {
  male: "2926cb350f1a426d800bf8c360c3cb94",
  female: "be404a1ef6704fdb86d02ea05ad0bcc2",
};

const VOICE_KEY = "storylingo-voice";
let voice: VoiceId = "female";
const voiceListeners = new Set<(v: VoiceId) => void>();

if (typeof localStorage !== "undefined") {
  const saved = localStorage.getItem(VOICE_KEY);
  if (saved === "male" || saved === "female") voice = saved;
}

export function getVoice(): VoiceId {
  return voice;
}

export function setVoice(next: VoiceId) {
  if (next === voice) return;
  voice = next;
  try {
    localStorage.setItem(VOICE_KEY, next);
  } catch {
    /* storage unavailable */
  }
  stopAudio();
  voiceListeners.forEach((l) => l(next));
}

export function onVoiceChange(listener: (v: VoiceId) => void): () => void {
  voiceListeners.add(listener);
  listener(voice);
  return () => voiceListeners.delete(listener);
}

/** Bump when the TTS backend or voices change, so stale clips are ignored. */
const CACHE_VERSION = "v3";

function cacheKey(text: string, slow: boolean) {
  return `${CACHE_VERSION}:fish-${VOICE_IDS[voice]}:${slow ? "slow" : "normal"}:${text}`;
}

/** Drop clips cached by an older narrator/model so nothing plays the old voice. */
async function purgeStaleCache() {
  const db = await openDb();
  if (!db) return;
  const store = db.transaction(STORE, "readwrite").objectStore(STORE);
  const req = store.getAllKeys();
  req.onsuccess = () => {
    for (const k of req.result) {
      if (typeof k === "string" && !k.startsWith(`${CACHE_VERSION}:`)) store.delete(k);
    }
  };
}

if (typeof indexedDB !== "undefined") void purgeStaleCache();

export async function getClip(text: string, slow: boolean): Promise<Blob | null> {
  const key = cacheKey(text, slow);
  const hit = memory.get(key);
  if (hit) return hit;

  const existing = inflight.get(key);
  if (existing) return existing;

  const requestVoice = voice;
  const task = (async () => {
    const cached = await readCache(key);
    if (cached) {
      memory.set(key, cached);
      return cached;
    }
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, slow, voice: requestVoice }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (blob.size < 600) return null;
      memory.set(key, blob);
      // Only persist clips from the real narrator voice; fallback audio
      // must not stick around once the narrator is available again.
      if (res.headers.get("X-TTS-Provider") === "fish") void writeCache(key, blob);
      return blob;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}


let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let token = 0;
const listeners = new Set<(text: string | null) => void>();
let speakingText: string | null = null;

/** 0..1 position inside the clip currently playing, for word highlighting. */
const progressListeners = new Set<(p: number) => void>();
let speakingProgress = 0;

function setProgress(p: number) {
  speakingProgress = p;
  progressListeners.forEach((l) => l(p));
}

export function onSpeakingProgress(listener: (p: number) => void): () => void {
  progressListeners.add(listener);
  listener(speakingProgress);
  return () => progressListeners.delete(listener);
}

/** Report playback position while a clip runs. */
function trackProgress(audio: HTMLAudioElement, mine: number) {
  audio.ontimeupdate = () => {
    if (mine !== token) return;
    const d = audio.duration;
    if (Number.isFinite(d) && d > 0) setProgress(Math.min(audio.currentTime / d, 1));
  };
}

function setSpeaking(text: string | null) {
  speakingText = text;
  setProgress(0);
  listeners.forEach((l) => l(text));
}


export function onSpeakingChange(listener: (text: string | null) => void): () => void {
  listeners.add(listener);
  listener(speakingText);
  return () => listeners.delete(listener);
}

export function stopAudio() {
  token += 1;
  if (current) {
    current.pause();
    current.src = "";
    current = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  setSpeaking(null);
}

/** Play one clip. Any clip already playing is cancelled first. */
export async function speak(text: string, slow = false): Promise<void> {
  stopAudio();
  const mine = token;
  const blob = await getClip(text, slow);
  if (!blob || mine !== token) return;

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  current = audio;
  currentUrl = url;
  setSpeaking(text);

  await new Promise<void>((resolve) => {
    const done = () => {
      if (mine === token) {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        current = null;
        currentUrl = null;
        setSpeaking(null);
      }
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    void audio.play().catch(done);
  });
}

/** Play a list of clips one after another (cancelled by any new speak/stop). */
export async function speakSequence(texts: string[], slow = false): Promise<void> {
  stopAudio();
  const mine = token;
  for (const text of texts) {
    if (mine !== token) return;
    const blob = await getClip(text, slow);
    if (!blob || mine !== token) return;

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    current = audio;
    currentUrl = url;
    setSpeaking(text);

    const finished = await new Promise<boolean>((resolve) => {
      const done = () => resolve(mine === token);
      audio.onended = done;
      audio.onerror = done;
      void audio.play().catch(done);
    });
    URL.revokeObjectURL(url);
    if (!finished) return;
  }
  if (mine === token) {
    current = null;
    currentUrl = null;
    setSpeaking(null);
  }
}

/** Warm the cache for a chapter without playing anything. */
export function preload(sentences: string[], words: string[]) {
  const queue = [...words.map((w) => [w, true] as const), ...sentences.map((s) => [s, false] as const)];
  let i = 0;
  const step = async () => {
    if (i >= queue.length) return;
    const [text, slow] = queue[i++];
    await getClip(text, slow);
    setTimeout(step, 120);
  };
  void step();
}
