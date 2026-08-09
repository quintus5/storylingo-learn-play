# Real learning progress, one honest coin balance, consistent vocabulary

## 1. Coins that never disagree

Two confirmed causes of the balance jumping between screens:

- The purse falls back to a placeholder of 2,000 coins before the device's saved balance is read (`EMPTY.coins = 2000` in `src/lib/progress.ts`), while a genuinely new reader starts on 150. So the first paint of any page can show 2,000 and then snap to the real number.
- The test switch (`?unlockAll=1`) tops the purse up to 99,999 for the session, and that flag lives in session storage, so some tabs/pages show test money and others don't.

Fix:

- The placeholder balance becomes the real starter amount (150), so the value shown before and after loading is the same number.
- The purse renders a quiet placeholder (no number) until the saved balance is loaded, so children never see a figure that then changes.
- Coins are read from one shared store for every screen — header, shop, book page, progress — so language switches and navigation can't produce different numbers.
- When the test switch is on, the purse is clearly marked as test money so a parent isn't confused by 99,999.

## 2. Progress that measures learning

The progress page currently shows stars, day streak and mastered-word count only. It gains real learning signal:

- **Words learned** — a word counts as learned after it is answered correctly in a quiz twice on different days; words seen but not yet learned are shown separately as "meeting" words.
- **Tones practised** — every quiz answer and every word tapped in the reader is bucketed by its pinyin tone (1-4 and neutral). A small five-bar chart shows how much practice each tone has had and the success rate per tone, so "third tone is shaky" becomes visible.
- **Listening accuracy** — the listening round already exists; its answers are recorded separately from matching/translation, giving a percentage over the last 20 listening questions plus a trend arrow.
- **Review streak** — alongside the day streak, a "practised on N of the last 7 days" strip, plus a "due for review" count of learned words not seen in 5+ days.

These appear as a summary row plus three cards on the book progress page, all in Thai/English through the existing `useT`. Everything stays on the device, same as today's progress.

## 3. Vocabulary consistency

Chapter word lists and the words inside sentences are generated in two separate AI passes, so the same word can arrive with different pinyin spacing ("bǎojiàn" vs "bǎo jiàn") and slightly different Thai meanings.

- One canonical word entry per chapter: entries are merged by the Chinese characters, and the chapter word list is the single source of truth for pinyin and Thai meaning.
- Pinyin is normalised the same way everywhere: one space between syllables, sandhi applied, no stray punctuation — so the reader, the word popup, the quiz and the word list always print the identical string.
- Where a sentence word and a chapter word disagree on meaning, the chapter entry wins and the sentence copy is rewritten to match at load time, so existing books are fixed without regeneration.

## Technical notes

- `src/lib/progress.ts`: `EMPTY.coins` → `STARTER_COINS`; add a `loaded` flag to `useProgress` for the purse placeholder; extend `Progress` with `toneStats` (per-tone attempts/correct), `listenLog` (bounded array of recent listening results), `wordLog` (`hanzi -> { correctDays: string[], lastSeen: string }`) and `activeDays` (bounded list of ISO days). Bump the storage key to `storylingo.progress.v2` with a migration that carries over v1 fields.
- `src/components/CoinPurse.tsx`: use the shared store's `loaded` flag; show a dash until loaded; show a "test" badge when `useTestUnlock()` is on.
- `src/routes/book.$bookId.chapter.$n.quiz.tsx`: record per-question tone and round kind through new `recordAnswer(word, kind, correct)` instead of the current `missWord`/`masterWord` pair (both kept as thin wrappers).
- `src/routes/book.$bookId.chapter.$n.index.tsx`: word taps also call `recordAnswer(word, "read", true)` for tone exposure.
- `src/routes/book.$bookId.progress.tsx`: new stat cards and the tone bar chart (plain divs, existing tokens — no chart library).
- Pinyin normalisation: add `normalizePinyin()` to `src/lib/pinyin.ts` (collapse whitespace, one space per syllable, keep tone marks) with unit tests in `src/lib/pinyin.test.ts`; apply it in `src/lib/story-schema.ts` transforms so new books are consistent, and in `src/lib/books.ts` when a book is loaded so existing books are reconciled (sentence words inherit chapter-list pinyin and `dict`).
- No database or generation-pipeline changes; all reconciliation happens in the loader.
