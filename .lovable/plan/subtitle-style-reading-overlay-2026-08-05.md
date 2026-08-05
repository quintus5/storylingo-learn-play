# Subtitle-style reading overlay

Shrink the reading panel so the illustration stays the star, and make the text read like film subtitles that expand to a full-screen page when you want it.

## Behaviour

Three states instead of the current bulky panel:

- **Subtitle (default + while narrating)** — a slim floating glass bar near the bottom, sized to its content (roughly 18-22% of the screen, capped). Shows one sentence at a time: the spoken line while narrating, or the sentence you last tapped/the first line when idle. Tap a word still opens the word popup.
- **Peek** — a light swipe-up or tap on the handle shows a couple of lines, still under a third of the screen.
- **Full page** — swipe up further, tap the handle again, or finish narration: the panel grows to the full screen with a stronger frosted backdrop, showing every sentence of the page, scrollable. Swipe down or tap the handle to return to subtitle.

Page turns always reset to subtitle state.

## Visual style

- Rounded floating glass card, inset from the screen edges (not edge-to-edge) in subtitle state: blurred translucent surface, hairline border, soft shadow, using existing `glass-panel` tokens.
- In full-screen state it snaps to the edges, corners round only at the top, and the blur/opacity increases so text is fully legible.
- The bottom scrim over the art fades in only when the panel is expanded, so the illustration stays clean in subtitle mode.
- Nav row (Back / page count / Next / Quiz) collapses to compact icon-only pills floating beside the subtitle bar, and returns to the full row in full-screen state.

## Technical notes

- Replace the boolean `expanded` in `src/routes/book.$bookId.chapter.$n.index.tsx` with a `panel: "subtitle" | "peek" | "full"` state; drive height with `max-h` classes (`~22vh` / `~32vh` / `100dvh`).
- Subtitle mode renders a single `SentenceCard` (spoken line, else active/first sentence); full mode renders the existing list.
- Keep the existing scroll-to-expand handler, mapped to step subtitle → peek → full; add a simple pointer drag on the handle for down-collapse.
- Add/adjust `@utility` classes in `src/styles.css` for the floating subtitle card and the conditional art scrim.
- Respect `prefers-reduced-motion` on the height transitions.
