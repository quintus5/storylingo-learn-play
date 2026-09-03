# Why the newest book has no pictures

## What I measured (not guessed)

- The book on the shelf with the blank icon is **"The Fox and the Tiger"**. Its cover is empty in the database (`cover_url: null`), and I queried both chapter rows: **chapter 1 and chapter 2 also have `image_url: null`**. So there is nothing for either the bookshelf or chapter reader to show.
- The older books are fine. I fetched two of them through the app's own image URL and measured the pixels that arrive: `1280x720` (16:9) for the newest painted book, and the old portrait book now arrives whole at `538x720` instead of being cropped. The 16:9 delivery fix from last time is holding.
- The server log says exactly why the new book is empty: **every single image request was refused by the image service with a rate-limit error** — 3 anchor pictures and 5 page pictures, all failed with "The story machine is busy right now."

## The real bug

Two things combine:

1. **No retry when the image service says "too many requests."** A rate-limit refusal is temporary and normal — the correct response is to wait a moment and ask again. Today one refusal permanently loses that picture.
2. **We ask for too many pictures at once.** Book creation fires all the character sheets and all the place views simultaneously, then four page pictures at a time — which is what triggers the rate limit in the first place.

And a third, quieter problem: **the failure was invisible.** The book was created, saved and put on the shelf as if it had worked. Nothing told you the pictures were missing.

## The fix

1. **Retry rate-limited image requests** — up to four attempts with a growing wait between them (roughly 2s, 5s, 12s). Only rate-limit and transient server errors retry; a bad key or bad request still fails immediately.
2. **One image request at a time, book-wide** — a single queue with a small gap between calls, replacing the current burst of parallel calls in both anchor painting and page painting. Slightly slower per book, but a book that finishes with all its pictures beats a fast book with none.
3. **Say when pictures failed** — count the failures during creation and, if any picture is missing, finish the book but report it plainly ("the story is ready, 5 of 5 pictures could not be painted — try Repaint"). No silent empty book.
4. **Repaint covers the cover too**, so an existing empty book can be filled in from developer mode rather than recreated.
5. **Fix this actual book completely**: after the change, run Repaint on "The Fox and the Tiger" and confirm its cover, anchors, chapter 1 pictures, and chapter 2 pictures all appear.

## Verification before I call it done

- Repaint the empty book and confirm the database now holds its cover and anchors, and that both chapter rows hold images.
- Fetch the new cover and one chapter picture through the app's own URL and measure the delivered pixels are 16:9.
- Re-read the server log for the repaint and confirm zero unrecovered image failures.
- Reload the bookshelf and confirm no card shows the placeholder icon.

## Technical notes

- `src/lib/ai.server.ts`: wrap `askSeedream` in a retry loop for 429/500/502/503/504 with exponential backoff and jitter; add a module-level promise-chained queue so concurrent callers serialise with a short inter-call delay. Keep the existing widescreen size list, dimension check and one-off portrait retry unchanged.
- `src/lib/story.server.ts`: `buildAnchors` stops using `Promise.all` over cast and places; `illustratePages` drops its 4-worker pool (the queue in `ai.server.ts` becomes the single throttle point). Both return a failure count.
- `src/lib/story.functions.ts`: creation flow surfaces the failure count in the status it returns; `repaintBook` also regenerates the cover when missing.
- No schema change, no migration, no regeneration of existing good books.
