# Four reader and quiz fixes

## 1. Phone: the picture is cropped to a sliver

The illustration fills the screen with `object-cover`. On a tall phone (393x574 and taller) a squarish painting gets cropped hard, so you only see a slice.

Fix: show the whole picture. The art layer becomes two layers — a blurred, scaled copy of the same image filling the background, and the real image on top sized with `object-contain` so nothing is cut off. On wide screens where the image already fits, it looks the same as now.

The subtitle box, controls, narration and writing practice are untouched.

## 2. Displayed text does not match what the voice reads

Confirmed in the data, not a voice bug: for many sentences the per-word list the reader displays is missing characters from the real sentence. Examples from existing books:

```text
sentence: 他觉得他最聪明。   displayed words: 他觉得最聪明
sentence: 大海蛇给他们一个袋子。 displayed words: 给袋子
sentence: 柯纳尔拿起了盾牌和长矛。 displayed words: 拿起盾牌和
```

Narration speaks the full sentence, so the child hears words that are not on screen.

Fix in two places:

- Validation: when a sentence's word list does not reconstruct the sentence (ignoring punctuation), drop the broken word list at parse time. The reader already falls back to rendering the full sentence line, so the screen matches the audio.
- Reader: apply the same check at render, so books already in the database display correctly without regeneration. Tapping a word is unavailable on those repaired lines; the line itself is still tappable to hear it.

Note: this makes old books correct but plainer (no per-word pinyin on the affected lines). Regenerating a book produces properly segmented words again.

## 3. Quiz: the answer audio is cut off when the next question loads

Choosing the right answer plays the word, but after 900ms the next question mounts and immediately stops all audio, chopping the clip.

Fix: wait for the answer clip to finish before advancing (with the existing short pause as a minimum), and only stop audio on question change when there is genuinely a new clip to play. The listening round still auto-plays its prompt.

## 4. Quiz button pushed off screen on phones

On the last page of a chapter the bottom-right cluster (back arrow, "Practice writing", "Quiz") is wider than a phone, so "Quiz" spills past the edge.

Fix: let that control row shrink and wrap instead of overflowing — compact icon-first buttons on small screens ("Practice writing" becomes a pencil pill, "Quiz" keeps its label but shrinks), with the full labels returning at `sm:`. Same buttons, same actions, all inside the screen.

## Technical notes

- `src/routes/book.$bookId.chapter.$n.index.tsx`: art layer split into blurred backdrop + `object-contain` image; sentence render guard comparing `words.join("")` to the hanzi stripped of punctuation; bottom control row switched to `min-w-0` + `flex-wrap` with responsive label hiding.
- `src/lib/story-schema.ts`: sentence transform drops `words` when the join does not match; add test fixtures for a matching and a mismatched sentence.
- `src/routes/book.$bookId.chapter.$n.quiz.tsx`: `answer()` awaits the spoken word before stepping; the per-step effect no longer blanket-stops audio.
- No changes to generation, storage, or the image API.
