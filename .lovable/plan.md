# Sentences slide sideways instead of stacking

Right now the text panel grows upward and can swallow the whole screen. Instead, the panel stays a fixed, short strip under the picture and the sentences live in a horizontal filmstrip: one sentence per "card", swiped left/right. When narration finishes a line, the strip glides to the next one on its own.

## How it will feel

- The panel keeps one height (roughly a quarter of the screen) at all times — the illustration is never covered.
- Sentences sit side by side in a horizontal track. One card fills the panel width; the neighbours peek in slightly at the edges so it's obvious you can swipe.
- Swipe left/right (or trackpad horizontal scroll) moves between sentences, snapping to each card.
- During "Read to me", the strip auto-advances: as each sentence starts, it slides that card into view and highlights the word being said.
- The word currently being read grows noticeably bigger (and stays gold) while the rest of the line sits smaller and calmer, so a child's eye can track along the sentence. It shrinks back as the next word takes over.
- Tapping a sentence card's own play button reads just that line and centres it.
- Small dots under the strip show which sentence you're on within the page.
- When you reach the last sentence and swipe further, nothing breaks — the page arrows stay in their slim bottom bar for turning pages.
- Vertical scrolling inside the panel is gone, so nothing expands over the artwork.

## Reading behaviour

- Changing pages resets the strip to the first sentence.
- Auto-advance during playback respects reduced motion (instant jump instead of glide).
- Word taps still open the existing word popup, unchanged.

## Technical notes

- Edit `src/routes/book.$bookId.chapter.$n.index.tsx` only (plus small token/keyframe additions in `src/styles.css` if needed).
- Replace the `panel` three-state ("subtitle" | "peek" | "full") logic and vertical `overflow-y-auto` container with a single fixed-height glass strip containing a `flex overflow-x-auto snap-x snap-mandatory` track; each `SentenceCard` becomes `snap-center w-[88%] shrink-0`.
- Track the active sentence index in state; sync it two ways: `onScroll` reads the nearest snapped child, and an effect on the `useSpeakingText()` value calls `scrollIntoView({ inline: "center", behavior: reduced ? "auto" : "smooth" })`.
- Remove the expand/collapse chevron and the duplicate full/compact nav blocks; keep one slim bottom nav with prev/next, "Page x of y", and the Quiz link.
- `SentenceCard` keeps its existing word-tap, pinyin, native-text and word-highlight rendering; the `compact` variant becomes the only variant, sized for the strip.
- Active-word emphasis: bump the existing `scale-105` on the active word to a larger transform (about 1.3x) with `origin-bottom`, keep the gold colour/ring, and add `motion-reduce:transform-none`. Use `items-end` on the word row so growing words don't shift the baseline.
- Keep all audio, music, voice and progress handlers untouched.
