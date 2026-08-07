# Fix everything from the audit

Work is grouped so each group can ship and be checked on its own. Ordered by how much damage the bug does today.

One assumption up front: **no sign-in screen is being added.** StoryLingo has no accounts today, and adding them would change the whole product. So the abuse fixes below use same-origin checks and server-side caps instead of user auth. Say the word if you'd rather add accounts and I'll re-plan groups 1 and 6.

Also: this backend has no rate-limiting primitive available, so "rate limit the TTS endpoint" is replaced by an origin check plus a cheaper retry rule.

---

## Group 1 — Security holes

- **Redirect SSRF.** The story importer validates the link you paste but then blindly follows redirects, so a harmless-looking link can be bounced at an internal address. Follow redirects manually, re-check every hop (max 3), and reject links that point straight at a raw IP.
- **Open narration endpoint.** `/api/tts` today answers anyone on the internet and spends your credits. Require the request to come from the app's own origin, and widen the audio size check so it stops paying for a second synthesis on long sentences.
- **Unlimited book generation.** Add a server-side cap (books created per hour, tracked in the database) so a script can't drain credits, and a hard limit on source length.

## Group 2 — Narration on iPhone/iPad

Read-aloud is silently dead on iOS because the audio element is created after a network fetch, which breaks Safari's tap rule.

- Keep one reusable audio element, unlocked on the first tap.
- Show a message when narration genuinely fails instead of doing nothing.
- Add an LRU limit to the saved-clip cache (about 300 clips) and handle the browser running out of space, instead of silently failing.

## Group 3 — Book generation reliability

- Mark a book `failed` when generation breaks, instead of leaving it stuck on "generating" forever.
- Add a **Finish this book** action that regenerates only the missing chapters.
- Refund the coins when a book never completes; move the deduction to *after* success.
- Auto-refresh the chapter list every few seconds while a book is generating.
- Add a timeout to the AI calls and cap illustrations to 4 at a time.
- Show real progress ("chapter 3 of 8") during the wait.

## Group 4 — Learning quality

- **Pinyin:** reject content whose pinyin has no tone marks and retry the model.
- **Tone sandhi:** correct 不 → bú before a 4th tone and 一 → yí / yì, so children learn the spoken form.
- **Quiz distractors:** never offer a wrong answer whose Thai meaning is identical to the right one, and draw them only from chapters already learned.
- **Word meanings:** hide the "in this sentence" line when it's just a copy of the dictionary meaning.
- **Rounds:** stop the three quiz rounds testing the same first few words.
- **Review:** feed previously missed words back into later quizzes.

## Group 5 — Reading experience and accessibility

- Locked chapters explain why they're locked and what they cost.
- Word popup: proper focus handling, so keyboard and screen-reader users can't tab behind it.
- Bigger tap targets (44px) on reader controls and tappable words.
- Loading state on every audio button.
- Clear the leftover timers in the shop, chapter list and quiz so nothing fires after leaving the page.
- Fix the "chapters done" count, which currently counts failed quizzes.
- Add a small finish-the-book celebration and a link to the shop/character from the reader.

## Group 6 — Type and layout

- Load a proper Thai webfont and loosen line height, so tone marks stop clipping.
- Raise pinyin from 10px to a readable size and even out the three-layer spacing.
- Move the narrator toggle out of the reader header so it stops crowding at 360px.
- Put the expanded reading panel above the header instead of under it.
- Add a placeholder colour behind illustrations to kill the dark flash between pages.

---

## Technical notes

- `src/lib/story.server.ts`: `assertSafeUrl` re-run per hop with `redirect: "manual"`; `AbortSignal.timeout(90_000)` added to the two gateway fetches in `src/lib/ai.server.ts`; `illustratePages` gains a concurrency pool.
- `src/routes/api/tts.ts`: same-origin `Origin`/`Referer` check; `maxBytes` widened so the paid retry is rare.
- `src/lib/audio.ts`: single unlocked `HTMLAudioElement`; `{blob, lastUsed}` records with LRU prune on open; memory map capped; `speak` returns a status.
- `src/lib/story.functions.ts`: `books.status = 'failed'`, a `generation_error` column, and a hourly creation-count guard; migration adds both columns.
- `src/lib/story-schema.ts`: tone-mark regex on `pinyin`, `context === dict` stripped, plus new fixture tests.
- New `src/lib/pinyin.ts` for the 不/一 sandhi pass, unit-tested.
- Quiz distractor filter widened to `dict`/`native`; round offsets staggered.
- `src/routes/__root.tsx` head link gains Noto Sans Thai; `--font-sans` updated in `src/styles.css`.
- Timers moved into refs with effect cleanup in `shop.tsx`, `book.$bookId.index.tsx`, and the quiz route.

## Not doing

- User accounts / per-user book ownership (needs your call — see the assumption above).
- Cloud sync of coins and stars across devices (same reason: needs accounts).
- Verbatim-copy detection against the source text — low real-world risk since output is Mandarin from an English source; can add later if you want it.
