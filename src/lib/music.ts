/**
 * Gentle scene-aware background music, synthesised in the browser with Web Audio.
 * No downloads, no licensing, and the mood follows what happens in the chapter.
 */

export type Mood = "calm" | "playful" | "adventure" | "mystery" | "tender";

const MOODS: Record<
  Mood,
  { scale: number[]; root: number; tempo: number; wave: OscillatorType; padGain: number }
> = {
  calm: { scale: [0, 2, 4, 7, 9], root: 220, tempo: 2.4, wave: "sine", padGain: 0.05 },
  playful: { scale: [0, 2, 4, 7, 9, 12], root: 330, tempo: 1.0, wave: "triangle", padGain: 0.035 },
  adventure: { scale: [0, 2, 5, 7, 10], root: 196, tempo: 1.3, wave: "triangle", padGain: 0.055 },
  mystery: { scale: [0, 3, 5, 7, 10], root: 165, tempo: 2.0, wave: "sine", padGain: 0.06 },
  tender: { scale: [0, 4, 7, 9, 11], root: 262, tempo: 2.8, wave: "sine", padGain: 0.045 },
};

const KEYWORDS: [Mood, RegExp][] = [
  [
    "adventure",
    /\b(run|running|chase|journey|travel|climb|escape|storm|race|battle|brave|hunt|search)\b/i,
  ],
  ["mystery", /\b(night|dark|secret|hidden|myster|shadow|quiet|sneak|steal|thief|fog|cave)\b/i],
  ["playful", /\b(play|laugh|happy|funny|friend|dance|game|joy|smile|party|bounce|celebrat)\b/i],
  ["tender", /\b(sad|cry|home|mother|father|sleep|dream|kind|gentle|love|hug|miss|comfort)\b/i],
];

/** Pick a mood from the English scene / summary text of a chapter. */
export function moodFor(text: string): Mood {
  for (const [mood, re] of KEYWORDS) if (re.test(text)) return mood;
  return "calm";
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let playing = false;

function noteHz(root: number, semitones: number) {
  return root * Math.pow(2, semitones / 12);
}

function scheduleLoop(mood: Mood) {
  if (!ctx || !master) return;
  const cfg = MOODS[mood];
  const step = () => {
    if (!ctx || !master || !playing) return;
    const now = ctx.currentTime;
    const semis = cfg.scale[Math.floor(Math.random() * cfg.scale.length)];
    const octave = Math.random() < 0.3 ? 12 : 0;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = cfg.wave;
    osc.frequency.value = noteHz(cfg.root, semis + octave);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(cfg.padGain, now + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + cfg.tempo * 1.1);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + cfg.tempo * 1.2);

    timer = setTimeout(step, cfg.tempo * 1000 * (0.7 + Math.random() * 0.5));
  };
  step();
}

export function startMusic(mood: Mood) {
  if (typeof window === "undefined") return;
  stopMusic();
  const AudioCtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return;
  ctx = ctx ?? new AudioCtor();
  void ctx.resume();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  playing = true;
  scheduleLoop(mood);
}

export function stopMusic() {
  playing = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (master) {
    try {
      master.disconnect();
    } catch {
      /* already gone */
    }
    master = null;
  }
}

/** Duck the music while narration is speaking. */
export function setMusicDucked(ducked: boolean) {
  if (!master || !ctx) return;
  master.gain.setTargetAtTime(ducked ? 0.15 : 0.5, ctx.currentTime, 0.3);
}

export function isMusicPlaying() {
  return playing;
}
