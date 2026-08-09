# Reader polish, voice picker, dev delete, and a staged book-building pipeline

## 1. Reading strip fixes

- Drop the gold box/ring behind the word being read. The word only grows bigger (and keeps the gold colour); no background, no outline.
- Fix the first and last sentence sitting off-centre: add half-gap side padding to the horizontal track so every card, including the first and last, snaps to the true centre of the screen.
- Make the panel much shorter — roughly a sixth of the screen instead of two fifths. Tighter padding, smaller Thai line, and the strip sized to the sentence itself.
- Move the small controls to the right edge of the panel on one row: "Hear this line", the sentence dots, and page position. The sentence text keeps the centre.
- The next arrow expands on hover/focus to read "Next page" so it can't be mistaken for "next sentence". The current page ("Page 1 of 3") is folded into that arrow and appears on hover instead of taking its own line.
- Big translucent chevrons sit on the left and right of the sentence itself for previous/next sentence — soft frosted circles that stay faint over the artwork, brighten and nudge sideways on hover, and press in with a small squeeze on tap. They fade out at the first/last sentence and are hidden when a page has only one sentence. Reduced-motion users get the brightness change without the movement.


## 2. Narrator voices

- Replace the emoji toggle with a clearly labelled "Voice" button showing the current name.
- Tapping it opens a small dropdown with four choices, each wired to its real voice id:
  - Wang — `59cb5986671546eaa6ca8ae6f29f6d22`
  - Kenshi — `5a88883c20a84f378db686ac6b0bba79`
  - Hong — `5fc69411fe274f149bce4e743534ffa4`
  - Lee — `626bb6d3f3364c9cbc3aa6a67300a664`
- Wang becomes the default narrator; the old male/female setting is migrated to it so no one lands on a missing voice.
- Switching voice stops any clip playing and the selection is remembered on the device. Each voice caches its own clips, so switching back is instant.

## 3. Hidden developer delete

- Double-clicking the moon logo on the bookshelf turns on developer mode for that session.
- While on, each book cover shows a small "x". Pressing it asks for confirmation, then permanently deletes the book, its chapters and pages from the database.
- The mode turns itself off on reload and leaves no visible trace for normal use.

## 4. Staged book-building pipeline

Built as TypeScript agents in this app (no Python — this backend runs on a JavaScript edge runtime, so `*agent.py` files cannot run here). Each stage is its own module with a typed input/output contract, the Zod equivalent of Pydantic models.

Stages, each a separate agent file:

```text
scrape-agent   -> fetch + clean source text, cached per URL
plan-agent     -> chapter count, titles, art style, target length
cast-agent     -> rank characters & locations, keep top N
anchor-agent   -> generate one anchor image per top character/location
shot-agent     -> shot list sized to the chapter budget, then a revise pass
render-agent   -> per shot: illustration (reusing anchors) + narration text, revise pass
```

Anchor images are the key win: every page image references the same character and location anchors, so the cast stops drifting between chapters.

Progress streams live to the creation screen over SSE — one line per stage with its assets appearing as they land, instead of the single long spinner today.

## Technical notes

- Reader work is confined to `src/routes/book.$bookId.chapter.$n.index.tsx` (plus small token tweaks in `src/styles.css`).
- Voices: extend `VoiceId` and `VOICE_IDS` in `src/lib/audio.ts` to the four named entries with placeholder reference ids, mirror the enum in `src/routes/api/tts.ts` `FISH_VOICES` with a fallback map, and swap the header button in the reader for a dropdown. Cache key already includes the voice id, so clips stay per-voice.
- Delete: `deleteBook` server function in `src/lib/story.functions.ts` doing a cascading delete, plus a migration adding the delete policy/grants if the current policies don't allow it. Bookshelf UI gets the dev-mode state and per-cover remove button.
- Pipeline: new `src/lib/agents/*.agent.ts` modules with Zod contracts, orchestrated by a server route under `src/routes/api/` that emits SSE; `src/routes/create.tsx` consumes the stream. Existing `story.server.ts` helpers are reused for fetching and image generation rather than rewritten.
- Stages 1-3 are independent of stage 4 and can ship first if you want the UI fixes right away.
