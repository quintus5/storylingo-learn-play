/**
 * Pinyin helpers: tone-mark checks and the two tone-sandhi rules children
 * hear from day one (不 and 一). Wrong tones are worse than no audio, so
 * generated pinyin is validated before it ever reaches the reader.
 */

/** Tone-marked vowels, indexed by tone number. */
const TONE_VOWELS: Record<string, number> = {
  ā: 1, ē: 1, ī: 1, ō: 1, ū: 1, ǖ: 1, Ā: 1, Ē: 1, Ī: 1, Ō: 1, Ū: 1,
  á: 2, é: 2, í: 2, ó: 2, ú: 2, ǘ: 2, Á: 2, É: 2, Í: 2, Ó: 2, Ú: 2,
  ǎ: 3, ě: 3, ǐ: 3, ǒ: 3, ǔ: 3, ǚ: 3, Ǎ: 3, Ě: 3, Ǐ: 3, Ǒ: 3, Ǔ: 3,
  à: 4, è: 4, ì: 4, ò: 4, ù: 4, ǜ: 4, À: 4, È: 4, Ì: 4, Ò: 4, Ù: 4,
};

const TONE_CHARS = Object.keys(TONE_VOWELS).join("");
const TONE_RE = new RegExp(`[${TONE_CHARS}]`);

/** Tone of a single syllable: 1-4, or 0 for neutral/unmarked. */
export function syllableTone(syllable: string): number {
  for (const ch of syllable) {
    const tone = TONE_VOWELS[ch];
    if (tone) return tone;
  }
  return 0;
}

/**
 * Accept only properly tone-marked pinyin. Numbered pinyin ("ni3 hao3") and
 * bare latin ("ni hao") teach the wrong pronunciation, so both are rejected.
 */
export function isToneMarked(pinyin: string): boolean {
  const text = pinyin.trim();
  if (!text) return false;
  // "hao3" style, or a stray digit anywhere.
  if (/\d/.test(text)) return false;
  // A single neutral particle ("le", "ma", "de") is legitimate.
  const syllables = text.split(/[\s'·-]+/).filter(Boolean);
  if (syllables.length === 0) return false;
  if (syllables.length === 1 && syllables[0].length <= 3) return true;
  return TONE_RE.test(text);
}

const NEUTRAL_TONE_MAP: Record<string, string> = {
  bù: "bú",
  yī: "yí",
};

/**
 * Apply 不/一 sandhi so the printed pinyin matches how the sentence is said:
 * 不 and 一 become 2nd tone before a 4th-tone syllable, and 一 becomes 4th
 * tone before 1st/2nd/3rd. Only runs when syllables line up with characters.
 */
export function applySandhi(hanzi: string, pinyin: string): string {
  if (!/[不一]/.test(hanzi)) return pinyin;

  const chars = [...hanzi].filter((c) => /[\u4e00-\u9fff]/.test(c));
  const parts = pinyin.split(/(\s+)/);
  const syllableIdx: number[] = [];
  parts.forEach((p, i) => {
    if (p.trim()) syllableIdx.push(i);
  });
  // Alignment is only safe when there is one syllable per character.
  if (syllableIdx.length !== chars.length) return pinyin;

  syllableIdx.forEach((partIndex, i) => {
    const char = chars[i];
    if (char !== "不" && char !== "一") return;
    const nextTone = i + 1 < syllableIdx.length ? syllableTone(parts[syllableIdx[i + 1]]) : 0;
    if (nextTone === 0) return;

    const current = parts[partIndex];
    const lower = current.toLowerCase();
    if (char === "不") {
      if (nextTone === 4 && lower.startsWith("bù")) parts[partIndex] = current.replace("bù", "bú");
      return;
    }
    if (!lower.startsWith("y")) return;
    if (nextTone === 4) {
      parts[partIndex] = current.replace(/y[īíǐì]/i, "yí");
    } else {
      parts[partIndex] = current.replace(/y[īíǐì]/i, "yì");
    }
  });

  return parts.join("");
}

export { NEUTRAL_TONE_MAP };
