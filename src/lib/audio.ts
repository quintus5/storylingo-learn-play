/**
 * Audio: one shared player, IndexedDB clip cache, background preloading.
 * A new request always cancels whatever is currently playing.
 */

const DB_NAME = "storylingo-audio";
const STORE = "clips";

/** How many clips we keep on the device before dropping the oldest ones. */
const MAX_CACHED_CLIPS = 300;
/** How many decoded clips we keep in memory for this session. */
const MAX_MEMORY_CLIPS = 50;

type ClipRecord = { blob: Blob; lastUsed: number };

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
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    const req = store.get(key);
    req.onsuccess = () => {
      const record = req.result as ClipRecord | Blob | undefined;
      if (!record) return resolve(null);
      const blob = record instanceof Blob ? record : record.blob;
      // Touch the record so the least-used clips are the ones pruned later.
      try {
        store.put({ blob, lastUsed: Date.now() } satisfies ClipRecord, key);
      } catch {
        /* pruning is best effort */
      }
      resolve(blob ?? null);
    };
    req.onerror = () => resolve(null);
  });
}

/** True when the clip was saved; false when the device refused (quota full). */
async function writeCache(key: string, blob: Blob): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise<boolean>((resolve) => {
    let ok = true;
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ blob, lastUsed: Date.now() } satisfies ClipRecord, key);
    tx.oncomplete = () => resolve(ok);
    tx.onabort = () => resolve(false);
    tx.onerror = () => {
      ok = false;
      resolve(false);
    };
  });
}

const memory = new Map<string, Blob>();
const inflight = new Map<string, Promise<Blob | null>>();

function remember(key: string, blob: Blob) {
  memory.set(key, blob);
  while (memory.size > MAX_MEMORY_CLIPS) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

/** Narrator voices (Fish Audio reference ids). */
export type VoiceId = "wang" | "kenshi" | "hong" | "lee";
export const VOICE_IDS: Record<VoiceId, string> = {
  wang: "59cb5986671546eaa6ca8ae6f29f6d22",
  kenshi: "5a88883c20a84f378db686ac6b0bba79",
  hong: "5fc69411fe274f149bce4e743534ffa4",
  lee: "626bb6d3f3364c9cbc3aa6a67300a664",
};
export const VOICE_NAMES: Record<VoiceId, string> = {
  wang: "Wang",
  kenshi: "Kenshi",
  hong: "Hong",
  lee: "Lee",
};
export const VOICE_LIST = Object.keys(VOICE_IDS) as VoiceId[];

const VOICE_KEY = "storylingo-voice";
const DEFAULT_VOICE: VoiceId = "wang";
let voice: VoiceId = DEFAULT_VOICE;
const voiceListeners = new Set<(v: VoiceId) => void>();

if (typeof localStorage !== "undefined") {
  const saved = localStorage.getItem(VOICE_KEY);
  // Older devices stored "male"/"female"; those fall back to the default.
  if (saved && (VOICE_LIST as string[]).includes(saved)) voice = saved as VoiceId;
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
const CACHE_VERSION = "v7";

function cacheKey(text: string, slow: boolean) {
  return `${CACHE_VERSION}:fish-${VOICE_IDS[voice]}:${slow ? "slow" : "normal"}:${text}`;
}

/**
 * Housekeeping on startup: drop clips from an older narrator/model, then keep
 * the cache to a fixed size so it can never fill the device up.
 */
async function pruneCache() {
  const db = await openDb();
  if (!db) return;
  const store = db.transaction(STORE, "readwrite").objectStore(STORE);
  const keysReq = store.getAllKeys();
  const valuesReq = store.getAll();
  keysReq.onsuccess = () => {
    valuesReq.onsuccess = () => {
      const keys = keysReq.result as IDBValidKey[];
      const values = valuesReq.result as (ClipRecord | Blob)[];
      const live: { key: IDBValidKey; lastUsed: number }[] = [];

      keys.forEach((k, i) => {
        if (typeof k !== "string" || !k.startsWith(`${CACHE_VERSION}:`)) {
          store.delete(k);
          return;
        }
        const v = values[i];
        live.push({ key: k, lastUsed: v instanceof Blob ? 0 : (v?.lastUsed ?? 0) });
      });

      if (live.length <= MAX_CACHED_CLIPS) return;
      live
        .sort((a, b) => a.lastUsed - b.lastUsed)
        .slice(0, live.length - MAX_CACHED_CLIPS)
        .forEach((entry) => store.delete(entry.key));
    };
  };
}

if (typeof indexedDB !== "undefined") void pruneCache();

/** Set once the device refuses to save clips, so we stop trying every time. */
let cacheFull = false;

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
      remember(key, cached);
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
      // Only persist clips from the real narrator voice; fallback audio
      // must not stick around once the narrator is available again.
      const fromNarrator = res.headers.get("X-TTS-Provider") === "fish";
      if (fromNarrator) remember(key, blob);
      if (fromNarrator && !cacheFull) {
        const saved = await writeCache(key, blob);
        if (!saved) {
          cacheFull = true;
          void pruneCache();
        }
      }
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


/**
 * One reusable element. iOS only lets audio start from inside a tap, so the
 * element must exist and be started during the gesture — creating a new
 * Audio() after awaiting the network would be blocked.
 */
let player: HTMLAudioElement | null = null;
let unlocked = false;
const SILENCE =
  "data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA" +
  "gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgP////////////////////////////" +
  "//8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAnGZTuU8AAAAAAAAAAAAAAAAAAAA";

function ensurePlayer(): HTMLAudioElement {
  if (!player) {
    player = new Audio();
    player.preload = "auto";
  }
  return player;
}

/**
 * Call from a tap handler before any awaiting. Starting (and immediately
 * pausing) silent audio marks the element as user-activated on iOS Safari,
 * so a clip fetched later is allowed to play.
 */
export function unlockAudio() {
  if (unlocked || typeof window === "undefined") return;
  const el = ensurePlayer();
  try {
    el.src = SILENCE;
    el.muted = true;
    void el.play().then(
      () => {
        el.pause();
        el.muted = false;
        unlocked = true;
      },
      () => {
        el.muted = false;
      },
    );
  } catch {
    el.muted = false;
  }
}

let currentUrl: string | null = null;
let token = 0;
const listeners = new Set<(text: string | null) => void>();
let speakingText: string | null = null;

/** 0..1 position inside the clip currently playing, for word highlighting. */
const progressListeners = new Set<(p: number) => void>();
let speakingProgress = 0;

/** Told about clips that could not be fetched or played, so the UI can react. */
const failureListeners = new Set<() => void>();

export function onAudioFailure(listener: () => void): () => void {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

function reportFailure() {
  failureListeners.forEach((l) => l());
}

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

function releaseUrl() {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

export function stopAudio() {
  token += 1;
  if (player) {
    player.pause();
    player.ontimeupdate = null;
    player.onended = null;
    player.onerror = null;
  }
  releaseUrl();
  setSpeaking(null);
}

/** Play one clip on the shared element. Returns false when nothing played. */
async function playBlob(blob: Blob, text: string, mine: number): Promise<boolean> {
  const audio = ensurePlayer();
  const url = URL.createObjectURL(blob);
  currentUrl = url;
  audio.src = url;
  setSpeaking(text);
  trackProgress(audio, mine);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      audio.onended = null;
      audio.onerror = null;
      resolve(ok && mine === token);
    };
    audio.onended = () => done(true);
    audio.onerror = () => done(false);
    void audio.play().catch(() => done(false));
  });
}

/**
 * Play one clip. Any clip already playing is cancelled first.
 * Returns true when the clip actually played to the end.
 */
export async function speak(text: string, slow = false): Promise<boolean> {
  unlockAudio();
  stopAudio();
  const mine = token;
  const blob = await getClip(text, slow);
  if (!blob) {
    reportFailure();
    return false;
  }
  if (mine !== token) return false;

  const finished = await playBlob(blob, text, mine);
  if (mine === token) {
    releaseUrl();
    setSpeaking(null);
  }
  if (!finished && mine === token) reportFailure();
  return finished;
}

/** Play a list of clips one after another (cancelled by any new speak/stop). */
export async function speakSequence(texts: string[], slow = false): Promise<void> {
  unlockAudio();
  stopAudio();
  const mine = token;
  for (const text of texts) {
    if (mine !== token) return;
    const blob = await getClip(text, slow);
    if (!blob) {
      reportFailure();
      return;
    }
    if (mine !== token) return;

    const finished = await playBlob(blob, text, mine);
    releaseUrl();
    if (!finished) {
      if (mine === token) reportFailure();
      return;
    }
  }
  if (mine === token) {
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
