# Voice options and making old books use the new voice

## How audio works today

Audio is never stored with a book. Every clip is generated on demand when a page or word is played, then cached in the browser (IndexedDB) under a key made only of the text and the slow/normal flag.

So: all books, old and new, now request audio from the new Fish Audio voice. The only exception is clips already generated and cached on a device before the switch — those keep playing the old voice until the cache key changes.

## Part 1 — Male / female narrator choice

- Two named voices:
  - Male: `2926cb350f1a426d800bf8c360c3cb94`
  - Female: `be404a1ef6704fdb86d02ea05ad0bcc2`
- The choice is a device-level setting stored in localStorage (like progress), defaulting to female.
- A small narrator toggle appears in the chapter reader header next to the music and "Read to me" buttons, so a child can switch storyteller mid-book. Switching stops any clip currently playing.
- The chosen voice is sent with each audio request, and preloading uses the same voice.

## Part 2 — Old cached clips

Include the voice in the cache key so previously cached clips are ignored and regenerated with the selected voice.

- Key becomes `fish-<voiceId>:slow:文字` instead of `slow:文字`.
- Each voice gets its own cached clips, so switching back and forth stays instant.

## Technical detail

- `src/lib/audio.ts`: add a voice registry (male/female ids), a `getVoice()/setVoice()` pair backed by localStorage with a change listener, include the voice id in `cacheKey()`, and pass `voice` in the `/api/tts` request body.
- `src/routes/api/tts.ts`: accept an optional `voice` field (`"male" | "female"`) in the Zod body, map it to the Fish reference id, and keep the current default when absent.
- `src/routes/book.$bookId.chapter.$n.index.tsx`: narrator toggle button in the reader header; changing it calls `stopAudio()` and re-preloads.
