# Writing practice: fix the stuck stroke bug and make it kinder

## The bug (confirmed)

In `src/components/StrokeWriter.tsx` the grid container is rendered with `key={wobble}`, and `wobble` is incremented on every missed stroke. Changing a React `key` throws away that DOM node and builds a new one — which deletes the hanzi-writer SVG living inside it. The character disappears from the box and no further strokes can be drawn, so a single mistake ends the attempt. The wobble animation was the only thing that needed the remount.

Fix: keep the DOM stable. Trigger the shake by toggling a CSS class on a wrapper *outside* the writer's own node and clearing it on animation end, never by remounting.

## What changes

1. **Re-attempt after a miss** — stroke misses shake the box and keep the same quiz running. Nothing is destroyed, you just try the stroke again. Character data is only rebuilt when the character or stage actually changes.

2. **Stage 2 gets help instead of a blank box**
   - The grid is bigger in the "write from memory" stage (roughly 260 -> 300 px, still fitting a 393 px phone).
   - After the first miss on a stroke, a faint outline of the character fades in as a hint; it fades back out on the next correct stroke. Two misses on the same stroke still show hanzi-writer's own animated hint, as today.

3. **Tap a character in the top row to jump to it**
   - The sentence row becomes buttons: tap any character to switch to writing it. Already-finished ones keep their tick and can be replayed.
   - Proper touch targets, aria-labels, and a pressed/active state; the row stays readable at a glance.

## Other quality-of-life improvements

- **Auto-replay after a character is finished** — when the last stroke lands, the completed character plays its stroke animation back once (with the celebration), so the child sees the correct order they just wrote before moving on. Skipped under reduced motion.
- **Replay the animation** — a "Show me again" button available in every stage, replaying the stroke animation for the current character.
- **No scroll-jank** — the drawing surface uses `touch-action: none` and swallows touch scrolling, so drawing a downstroke never scrolls the page or the dialog behind it.
- **Progress that reads clearly** — the stroke dots stay, plus "stroke 3 of 7" text for the current character.
- **No dead ends** — if a character has no stroke data, it is skipped automatically to the next one instead of showing a blocking panel; if the whole line has none, the writer closes cleanly with a short message.
- **Reduced motion respected** everywhere (shake, confetti, auto-replay, hint fade).
- **Coins only once per character** — the reward is paid the first time a character is completed, tracked by the existing `charsWritten` progress. Replaying a finished character is free practice and shows "already earned" instead of paying again or looking broken.


## Technical notes

All work is in `src/components/StrokeWriter.tsx`:
- Remove `key={wobble}`; use a `shake` boolean + `onAnimationEnd` reset on an outer wrapper div.
- Split the writer setup effect so it depends only on `target.hanzi` and `stage`; move miss/hint handling into refs so callbacks don't force re-creation.
- Use the writer instance's `showOutline()` / `hideOutline()` for the stage-2 faint hint.
- `SIZE` becomes a per-stage value; the rice grid and ink-splash coordinates scale with it.
- Add an `onPick(index)` path used by the tappable top row that cancels the current quiz and sets `index` + `stage: "watch"`.
