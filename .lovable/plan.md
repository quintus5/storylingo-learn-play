# Make old books pick up the new voice

## How audio works today

Audio is never stored with a book. Every clip is generated on demand when a page or word is played, then cached in the browser (IndexedDB) under a key made only of the text and the slow/normal flag.

So: all books, old and new, now request audio from the new Fish Audio voice. The only exception is clips that were already generated and cached on a device before the switch — those keep playing the old voice until the cache is cleared, because the cache key does not know which voice produced the clip.

## The fix

Add a voice/provider marker to the cache key so previously cached clips are ignored and regenerated with the current voice.

- Key becomes `fish-a3bda742:slow:文字` instead of `slow:文字`.
- Old entries simply stop matching; new clips are cached under the new key.
- Optionally clear the stale IndexedDB entries once on first load so the cache does not grow.

## Technical detail

- `src/lib/audio.ts`: extend `cacheKey()` with a voice version constant, and add a one-time cleanup that deletes entries not prefixed with the current version.
