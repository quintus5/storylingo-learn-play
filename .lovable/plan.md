# Slimmer sentence box, controls outside it, slower narration

## Layout

The bottom area becomes one row instead of a stacked panel:

```text
[ hear ]        [   centered sentence box   ]        [ < > ]
[ • • • ]                                            page arrows
```

- The glass box shrinks to fit the sentence only: no fixed tall panel, height driven by the text, narrower width (roughly 60-70% of the screen, centred), sitting at the very bottom.
- "Hear this line" moves out of the box to the bottom-left, with the sentence dots directly beside it.
- Page arrows move out of the box to the bottom-right, transparent (no pill background), still expanding on hover to show "Next page · 1/3"; the Quiz link keeps its filled style on the last page.
- Left/right sentence chevrons pull inward off the very edge so they have breathing room beside the box.
- Sentence text gets a step bigger (Hanzi, pinyin and Thai all scale up) since the box is tighter.
- Everything stays inside the safe area on mobile; on narrow screens the box takes more width and the side controls tuck under it rather than overlapping.

## Narration

- Slower speech overall: page-reading speed drops from 0.78 to about 0.65, and single-word slow playback from 0.55 to 0.5.
- A clear pause between sentences during "Read to me" — a short silent gap (~700ms) after each clip before the next starts, so the strip glide and the next line don't run together.

## Technical notes

- `src/routes/book.$bookId.chapter.$n.index.tsx`: restructure the bottom `<section>` from a glass panel wrapping everything into a bottom bar (`absolute inset-x-0 bottom-0 flex items-end justify-between`). Only the sentence track keeps the `glass-subtitle` surface, sized `w-[min(38rem,68%)] mx-auto`, height auto. Hear button + dots become a left cluster, page nav a right cluster with `bg-transparent`. `SentenceArrow` offsets change from `left-0.5/right-0.5` to a negative outside offset with side margin.
- Text sizes in `SentenceCard` bumped one Tailwind step each.
- `src/routes/api/tts.ts`: lower the `speed`/`prosody.speed` values for both the Fish and OpenAI paths.
- `src/lib/audio.ts`: `speakSequence` awaits a cancellable ~700ms delay between clips; bump `CACHE_VERSION` to `v7` so old faster clips are dropped.
