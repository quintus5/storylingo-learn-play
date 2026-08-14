/** Pure helpers for judging and trimming fetched source text. Safe to import anywhere. */

/** Count characters that indicate a broken decode or binary payload. */
export function junkRatio(text: string): number {
  if (!text.length) return 1;
  // \p{C} includes newlines/tabs, so ignore whitespace before counting.
  const junk = (text.match(/[\uFFFD]|(?!\s)\p{C}/gu) ?? []).length;
  return junk / text.length;
}

/** What closes a sentence, including the CJK fullwidth stops. */
const SENTENCE_END = /[.!?…。！？]+/gu;

/** Menus survive tag stripping as separate lines, bullets or pipes. */
const FRAGMENT_SPLIT = /[\n\r•·|｜›»]+/;

/** Below this a fragment is a label or a caption, not a paragraph. */
const PARAGRAPH_WORDS = 6;

/** Fragment ratios only mean something once a page has some structure. */
const MIN_FRAGMENTS = 8;

/**
 * Prose ends sentences. English paragraphs run 8-15 sentence endings per
 * thousand characters and Chinese 25-40, so paragraphs under this are a
 * player caption or a table of links rather than a story.
 */
const MIN_SENTENCE_DENSITY = 2;

/** Above this share of labels, a page is chrome with something pasted in it. */
const LABEL_SHARE = 0.5;

/** Menu items that end in full stops still average almost no words. */
const MIN_SENTENCE_WORDS = 3;

/** Chrome says "Next", "Read more", "Home" over and over; prose does not. */
const MAX_REPEAT_RATIO = 0.5;

/** Short text is refused by assertReadable already, so leave it alone here. */
const MIN_PROSE_CHARS = 200;

export type ProseSignals = {
  chars: number;
  /** Characters sitting in fragments long enough to be a paragraph. */
  proseChars: number;
  /** Sentence endings inside those paragraphs. */
  sentences: number;
  /** Sentence endings per thousand paragraph characters. */
  sentenceDensity: number;
  /** Mean words per sentence, counted CJK-aware. */
  meanSentenceWords: number;
  /** Share of fragments too short to be a paragraph. */
  fragmentRatio: number;
  /** Share of fragments that repeat a label seen earlier. */
  repeatRatio: number;
};

/**
 * Measure the few things that separate a story from a navigation bar.
 *
 * Everything is measured over the paragraph-length fragments only. Judging the
 * whole page instead would let a wall of menu items drown out the punctuation
 * of the real paragraphs, and it is exactly the pages with heavy chrome around
 * a genuine story that we must not refuse.
 */
export function proseSignals(text: string): ProseSignals {
  const trimmed = text.trim();
  const fragments = trimmed
    .split(FRAGMENT_SPLIT)
    .map((f) => f.trim())
    .filter(Boolean);

  const paragraphs: string[] = [];
  const labels: string[] = [];
  for (const fragment of fragments) {
    if (estimateWordCount(fragment) >= PARAGRAPH_WORDS) paragraphs.push(fragment);
    else labels.push(fragment);
  }

  const prose = paragraphs.join("\n");
  const proseChars = prose.length;
  const sentences = (prose.match(SENTENCE_END) ?? []).length;
  const words = estimateWordCount(prose);

  const seen = new Set<string>();
  let repeats = 0;
  for (const label of labels) {
    const key = label.toLowerCase();
    if (seen.has(key)) repeats += 1;
    else seen.add(key);
  }
  // A page with no block structure left (everything on one line) has no ratios
  // worth trusting, so they stay at zero and it is allowed through.
  const structured = fragments.length >= MIN_FRAGMENTS;

  return {
    chars: trimmed.length,
    proseChars,
    sentences,
    sentenceDensity: proseChars ? (sentences / proseChars) * 1000 : 0,
    meanSentenceWords: sentences ? words / sentences : 0,
    fragmentRatio: structured ? labels.length / fragments.length : 0,
    repeatRatio: structured ? repeats / fragments.length : 0,
  };
}

/**
 * True when the text reads like site chrome rather than a story. A video page
 * or a category listing passes the binary-junk check easily, and the model
 * will then happily "retell" a website menu to a child.
 *
 * Deliberately shy: every rule wants two kinds of evidence, because letting an
 * odd source through only makes a strange book, while blocking a real story
 * costs the child their book altogether.
 */
export function looksLikeNavigation(text: string): boolean {
  const s = proseSignals(text);
  if (s.chars < MIN_PROSE_CHARS) return false;
  // Half the page is labels and what is left never finishes a sentence.
  if (s.sentenceDensity < MIN_SENTENCE_DENSITY && s.fragmentRatio > LABEL_SHARE) return true;
  // Plenty of full stops, but each "sentence" is a menu item.
  if (s.sentences >= 6 && s.meanSentenceWords < MIN_SENTENCE_WORDS) return true;
  // The same handful of labels, repeated down the page.
  if (s.repeatRatio > MAX_REPEAT_RATIO) return true;
  return false;
}

/** Refuse pages that are chrome rather than prose, in words a child can hear. */
export function assertProse(text: string): void {
  if (looksLikeNavigation(text)) {
    throw new Error(
      "That page looks like a menu or a video page, not a story. Please find a link where the story's words are written on the page.",
    );
  }
}

/**
 * Reject text that is mostly binary junk rather than real prose.
 * Any Unicode letter, mark, number, whitespace, punctuation or symbol counts as
 * readable — this keeps CJK fullwidth punctuation (：，。？“”·) from being penalised.
 */
export function assertReadable(text: string): void {
  if (text.length < 200) {
    throw new Error("That page didn't contain enough story text to work with.");
  }
  if (junkRatio(text) > 0.05) {
    throw new Error(
      "That link didn't give back readable text — it looks like a file StoryLingo can't read.",
    );
  }
  assertProse(text);
}

/** Rough "word" count that also works for Chinese/Japanese text with no spaces. */
export function estimateWordCount(text: string): number {
  const han = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
  if (han / Math.max(text.length, 1) > 0.2) return Math.round(han / 1.7);
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Project Gutenberg wraps every book in a licence banner. It is the only
 * licensed part of the file, and left in place it fills the first pages we
 * hand to the model with terms of use instead of the story.
 */
const GUTENBERG_START =
  /\*{2,}\s*start of (?:the\s+|this\s+)?project\s+gutenberg[^*\n]{0,200}(?:\*{2,})?/i;
const GUTENBERG_END = /\*{2,}\s*end of (?:the\s+|this\s+)?project\s+gutenberg/i;

/** Cut a Gutenberg text down to the book itself, when the markers are there. */
export function stripGutenbergBoilerplate(text: string): string {
  let out = text;
  const start = GUTENBERG_START.exec(out);
  if (start) out = out.slice(start.index + start[0].length);
  const end = GUTENBERG_END.exec(out);
  if (end) out = out.slice(0, end.index);
  const trimmed = out.trim();
  // A marker matched in an odd place can swallow the book; the untouched text
  // is always better than a few stray lines.
  return trimmed.length >= MIN_PROSE_CHARS ? trimmed : text;
}

/**
 * Fragments that address a widget rather than a place in the document: a
 * Google Custom Search tab, campaign tracking, or a browser text-highlight
 * link. Searching the document for these finds nothing, so treat them as
 * absent instead of reporting an unresolvable anchor.
 */
const NOISE_FRAGMENT = /^(gsc\.|utm_|:~:text=)/i;

/** The part of a link after "#", when it names a place in the document. */
export function contentFragment(url: string): string | null {
  const hash = url.indexOf("#");
  if (hash < 0) return null;
  const raw = url.slice(hash + 1);
  let fragment = raw;
  try {
    fragment = decodeURIComponent(raw);
  } catch {
    // A malformed escape is still usable as written.
  }
  fragment = fragment.trim();
  if (!fragment || NOISE_FRAGMENT.test(fragment)) return null;
  return fragment;
}

/** How much HTML one anchored section may claim before we stop reading. */
const FRAGMENT_HTML_BUDGET = 120_000;

/** How far either side of the anchor we look for the heading it belongs to. */
const HEADING_WINDOW = 400;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Cut the slice of HTML that a URL fragment points at. HTTP never transmits
 * the fragment, so without this a chapter link fetches the whole book and the
 * first 24k characters are its front matter rather than the requested chapter.
 *
 * Returns null when the anchor is nowhere in the document, so the caller can
 * fall back to the whole page and say that the fragment did not resolve.
 */
export function sliceHtmlAtFragment(html: string, fragment: string): string | null {
  const id = escapeRegExp(fragment);
  // id and name may be quoted with either quote, or not quoted at all.
  const anchorRe = new RegExp(
    `<([a-z][a-z0-9]*)\\b[^>]*?\\s(?:id|name)\\s*=\\s*(?:"${id}"|'${id}'|${id})(?=[\\s/>])[^>]*>`,
    "i",
  );
  const anchor = anchorRe.exec(html);
  if (!anchor) return null;

  const start = anchor.index;
  const afterAnchor = start + anchor[0].length;
  let scanFrom = afterAnchor;

  // Work out which heading rank this section sits at, so the next heading of
  // the same or a higher rank ends it rather than every little subheading.
  let level = 0;
  const self = /^<h([1-6])\b/i.exec(anchor[0]);
  if (self) {
    level = Number(self[1]);
  } else {
    // <h2><a id="..."></a>Chapter</h2>: the heading opened just before us.
    const behind = html.slice(Math.max(0, start - HEADING_WINDOW), start);
    const opened = [...behind.matchAll(/<h([1-6])\b/gi)].pop();
    if (opened) {
      level = Number(opened[1]);
    } else {
      // <a id="..."></a><h2>Chapter</h2>: it opens just after us instead, and
      // the section must not be ended by its own heading.
      const ahead = /<h([1-6])\b/i.exec(html.slice(afterAnchor, afterAnchor + HEADING_WINDOW));
      if (ahead) {
        level = Number(ahead[1]);
        scanFrom = afterAnchor + ahead.index + ahead[0].length;
      }
    }
  }

  const ends: number[] = [];
  if (level > 0) {
    const headingRe = new RegExp(`<h[1-${level}][\\s>]`, "gi");
    headingRe.lastIndex = scanFrom;
    const nextHeading = headingRe.exec(html);
    if (nextHeading) ends.push(nextHeading.index);
  }

  // Numbered anchors have numbered siblings: link2HCH0041 is followed by
  // link2HCH0042, which marks where this chapter stops.
  const stem = /^(.*?)(\d+)$/.exec(fragment);
  if (stem && stem[1].length >= 2) {
    const siblingRe = new RegExp(
      `<[a-z][a-z0-9]*\\b[^>]*?\\s(?:id|name)\\s*=\\s*["']?${escapeRegExp(stem[1])}\\d`,
      "gi",
    );
    siblingRe.lastIndex = scanFrom;
    const sibling = siblingRe.exec(html);
    if (sibling) ends.push(sibling.index);
  }

  const budget = start + FRAGMENT_HTML_BUDGET;
  const end = Math.min(budget, ...ends.filter((i) => i > scanFrom));
  return html.slice(start, end);
}
