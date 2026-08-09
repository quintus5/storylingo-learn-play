# StoryLingo: reader polish, Thai-first, real progress, coin fix, kid guidance

## 1. Slimmer sentence box, controls outside it

The bottom area becomes one row instead of a stacked panel:

```text
[ hear ]        [   centered sentence box   ]        [ < > ]
[ • • • ]                                            page arrows
```

- The glass box hugs the sentence only: no fixed or minimum height, no empty space above or below the three lines, even tight padding — never a half-empty rectangle. Narrower too (about 60-70% of the screen, centred), sitting at the very bottom.
- Height stays steady while swiping between sentences on a page (sized to the tallest card), so it doesn't jump as lines change length.
- "Hear this line" moves out of the box to the bottom-left, with the sentence dots directly beside it.
- Page arrows move out to the bottom-right, transparent (no pill), still expanding on hover to show "Next page · 1/3"; the Quiz link keeps its filled style on the last page.
- Left/right sentence chevrons pull inward off the edge so they have breathing room beside the box.
- Sentence text goes a step bigger (Hanzi, pinyin and Thai) since the box is tighter.
- Everything stays inside the mobile safe area; on narrow screens the box takes more width and the side controls tuck under it rather than overlapping.

## 2. Slower narration with a pause between sentences

- Page-reading speed drops from 0.78 to about 0.65; single-word slow playback from 0.55 to 0.5.
- During "Read to me", a ~700ms silent gap after each clip so the strip glide and the next line don't run together.

## 3. Thai-first child experience

Story titles, blurbs and chapter titles are currently saved in English only — the Thai versions the preview produces are discarded.

- Books gain a Thai title and blurb; chapters gain a Thai title, saved at creation from the text the preview already generates.
- Every title/blurb shown (bookshelf, book page, reader header, quiz, vocabulary, progress) uses the Thai version when the interface is Thai, falling back to English only if missing.
- Books already in the shelf get a one-time translation the first time they're opened in Thai — title, blurb and all chapter titles in a single pass, saved so it never repeats.
- Sweep every screen for English-only text: not-found and error states, empty states, toasts, tab titles/descriptions per route, and `aria-label`s.
- Thai renders in Noto Sans Thai with looser line height in child-facing text so tone marks aren't clipped.

## 4. Progress that measures learning

The progress page adds real learning signal beside stars:

- **Words learned** — a word counts as learned after two correct quiz answers on different days; words met but not learned are shown separately.
- **Tones practised** — quiz answers and reader word taps are bucketed by tone (1-4 and neutral) into a five-bar chart with a success rate per tone, so a shaky third tone becomes visible.
- **Listening accuracy** — listening-round answers tracked separately, shown as a percentage over the last 20 questions with a trend arrow.
- **Review streak** — "practised on N of the last 7 days", plus a count of learned words not seen for 5+ days that are due for review.

Everything stays on the device, like today's progress.

## 5. One honest coin balance

Two confirmed causes of the jump between 150 and 2,000:

- The purse falls back to a 2,000-coin placeholder before the saved balance loads, while a new reader really starts on 150.
- The `?unlockAll=1` test switch tops the purse to 99,999 for the browser session, so some tabs show test money and others don't.

Fix: the placeholder becomes the real starter amount, the purse shows a dash (no number) until the saved balance loads, every screen reads from the same shared store, and test money is labelled as test money.

## 6. Vocabulary consistency

Chapter word lists and in-sentence words come from two AI passes, so pinyin spacing and Thai meanings drift ("bǎojiàn" vs "bǎo jiàn").

- One canonical entry per word per chapter, merged by the Chinese characters; the chapter list is the source of truth for pinyin and Thai meaning.
- Pinyin normalised identically everywhere: one space between syllables, sandhi applied, no stray punctuation.
- Existing books are reconciled when loaded, so no regeneration is needed.

## 7. Child-friendly guidance

A 10-year-old shouldn't have to guess what the controls mean.

- "Fetch book" becomes "หาเรื่องนี้ให้หน่อย / Find this story" with a one-line helper: paste a link or story text and we'll read it first.
- The art-style picker gets a plain-Thai one-liner per style ("ภาพหมึกจีนแบบโบราณ") plus a tiny sample thumbnail, instead of style jargon.
- The chapter slider gains a live plain-language readout: "8 บท ≈ อ่านวันละบท 8 วัน" so the number means something.
- Coin costs get a "what are coins?" bubble on the shop and purse: how coins are earned (stars from quizzes) and what they buy.
- Locked chapters explain the unlock condition in one child-readable line instead of just a padlock.
- All guidance is short, Thai-first, and uses the existing tooltip/hint pattern — no tutorial overlays or modal walkthroughs.

## Technical notes

- `src/routes/book.$bookId.chapter.$n.index.tsx`: bottom `<section>` becomes `absolute inset-x-0 bottom-0 flex items-end justify-between`; only the sentence track keeps `glass-subtitle`, sized `w-[min(38rem,68%)] mx-auto`, height auto. Hear + dots form the left cluster, page nav the right cluster with `bg-transparent`. `SentenceArrow` moves from `left-0.5/right-0.5` to a negative outside offset with side margin. Drop every `min-h`/`h-*` and vertical spacer on the panel and cards; track uses `items-stretch`, cards `h-auto`, single tight `py-3` — flex stretch keeps height constant across sentences with no hardcoded value. `SentenceCard` text sizes bumped one step.
- `src/routes/api/tts.ts`: lower `speed`/`prosody.speed` on both the Fish and OpenAI paths.
- `src/lib/audio.ts`: `speakSequence` awaits a cancellable ~700ms delay between clips; `CACHE_VERSION` → `v7`.
- Migration: add nullable `title_th`, `blurb_th` to `books` and `title_th` to `chapters` (existing public-read policies cover them); regenerate Supabase types after.
- `src/lib/story.server.ts` / `story-schema.ts`: persist preview Thai text at creation; chapter schema gains required `title_th`. New `backfillThaiTitles({ bookId })` server fn in `story.functions.ts`, called from the book route component via `useServerFn` (never a loader), no-op when `title_th` exists.
- `src/lib/progress.ts`: `EMPTY.coins` → `STARTER_COINS`; add a `loaded` flag; extend state with `toneStats`, `listenLog`, `wordLog` and `activeDays`; storage key bumped to `v2` with migration from v1. `recordAnswer(word, kind, correct)` replaces the `missWord`/`masterWord` pair (kept as wrappers).
- `src/lib/pinyin.ts`: add `normalizePinyin()` with unit tests; applied in the schema transforms and when books load in `src/lib/books.ts`.
- `src/routes/book.$bookId.progress.tsx`: new stat cards and tone bars using plain divs and existing tokens — no chart library.
