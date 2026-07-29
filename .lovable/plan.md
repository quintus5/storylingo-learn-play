## StoryLingo

An illustrated Mandarin-for-Thai-speakers picture book generator. Paste a story URL, and the app retells it as 8–10 beginner chapters with watercolor art, audio, quizzes and progress tracking.

### Scope from your answers
- Books are generated once and stored in the cloud (shareable, no login needed to read).
- Progress (stars, streak, words seen/missed) stays on the device.
- Input: story URL only.
- Art: one cover + one illustration per chapter.
- Language pair: Mandarin (target) ← Thai (native), pinyin romanization.

### Screens
1. **Bookshelf `/`** — night/desert storybook home. Cover art, book title, chapter grid with thumbnail, title, stars. Locked chapters wiggle on tap; a chapter unlocks only when the previous chapter's quiz is passed. "New story" button.
2. **Create `/create`** — title + story URL + chapter count (8–10). Progress log while generating (fetching → retelling → chapters → vocab → quizzes → illustrations). Redirects to the new book.
3. **Reader `/book/$bookId/chapter/$n`** — pages of 5–8 sentences. Each sentence stacks: large Hanzi, pinyin in primary, Thai in muted. Page-turn transition, page dots, read-aloud button for the page. Tapping a word opens a popup (dictionary meaning, pinyin, in-context Thai) and auto-plays slow audio; it closes only on X or outside tap.
4. **Quiz `/book/$bookId/chapter/$n/quiz`** — warm-up word list, then 3 rounds: matching, listening, translation. Distractors drawn from current + already-learned chapters. Early chapters show pinyin on options. Bounce/green vs shake/red, then 1–3 stars with a pop animation.
5. **Vocabulary `/book/$bookId/vocab`** — grouped by chapter, golden border on seen words, tap to hear.
6. **Parent panel `/book/$bookId/progress`** — words met, words mastered, chapters finished, day streak, trouble words.

### Content generation
A server function fetches the URL, extracts readable text, then asks the AI to produce a **retelling** (never verbatim source text) as strict JSON: chapters → pages → sentences → words, each word with hanzi, pinyin, dictionary gloss, contextual Thai; plus a quiz word set and an illustration prompt per chapter. Illustrations are generated as watercolor night/desert art and stored in a public storage bucket. Generation is chunked per chapter so long stories don't time out.

### Audio
Gemini Flash TTS through a server route, one word or sentence per request. Word audio is generated at slow rate. Every clip is cached in IndexedDB keyed by text+speed, so replays are instant and offline. A single shared audio controller guarantees only one clip plays — a new tap cancels the previous one. Entering a chapter preloads its sentence and word audio in the background. Each generated clip is length-validated and re-requested once if the output looks wrong (empty or far too long for the requested word).

### Design
Dark navy background, warm sand and gold accents, rounded storybook cards, soft glow. All colors as semantic tokens in `src/styles.css`. Buttons scale on hover / press, stars pop, locked cards wiggle, the active word pulses while speaking — all wrapped in a `prefers-reduced-motion` guard.

### Technical notes
- TanStack Start; routes as listed above, each with its own head metadata.
- Lovable Cloud: `books`, `chapters`, `pages`, `words` tables with public anon SELECT and server-side writes; a public `story-art` storage bucket for illustrations. Explicit GRANTs on every new table.
- Server functions (`createServerFn`) for URL fetch + AI generation; a server route for the TTS stream. `LOVABLE_API_KEY` stays server-side.
- Progress in localStorage under one versioned key, with a small typed hook (`useProgress`) exposing stars, unlocked chapters, seen/missed words and streak.
- Mobile-first layout, comfortable tap targets, works down to 360px and up to desktop.

### Build order
1. Design tokens + bookshelf shell with placeholder data
2. Cloud schema + storage bucket
3. URL ingest + AI retelling pipeline + illustrations
4. Reader with word popup
5. TTS service, cache, single-player controller, preloading
6. Quizzes and star awards
7. Vocabulary + parent panel
8. Animations, reduced-motion, responsive polish
