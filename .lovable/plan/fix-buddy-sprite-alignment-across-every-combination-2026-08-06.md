# Fix buddy sprite alignment across every combination

The layered buddy misaligns because the four painted bodies are not the same size or position: measuring the artwork shows the "sand" body spans 196–621px wide while the others sit around 209–592px. Every hair, outfit, hat and pet box is tuned to one body, so switching skin tone shifts the head and shoulders out from under the pieces.

## What will change

1. **Normalise the bodies.** Re-crop and re-scale each body PNG so all four share one bounding box, head centre and shoulder line. After that, one placement manifest is correct for every skin tone.
2. **Re-measure every piece.** Recompute the placement box for all hair, outfit, hat and pet layers against the normalised body, so heads, collars and hat brims line up.
3. **Temporary test unlock.** Add a hidden dev switch (URL flag `?unlockAll=1` on the character page, remembered for the session) that treats every outfit, hat and pet as owned. Shop prices and normal coin gating stay exactly as they are for real players.
4. **Check all combinations.** Walk through the full matrix in the browser (4 skins x 5 hair x 6 outfits, plus each hat and pet) with automated screenshots, and correct any remaining offsets in the manifest.

## Technical notes

- Body normalisation is done offline with a small Python/Pillow pass over `src/assets/character/*.png`: trim to alpha bbox, scale to a shared target height, and re-paste at a fixed anchor in the 816x816 frame.
- `src/lib/character-art.ts` keeps its `piece(src, left, top, width)` manifest; only the numbers change, plus a comment recording the shared anchor so future art can be matched to it.
- The dev unlock lives next to `owns()` in `src/lib/progress.ts` as a read-only override; nothing is written to saved progress, so it cannot leak coins or ownership.
- Bust framing (`HEAD_CENTER`, `BUST_ZOOM`) is re-derived from the normalised head position.
