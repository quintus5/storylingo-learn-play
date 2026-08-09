# Thai-first child experience

Right now the app chrome is bilingual, but the story content itself is not: book titles, blurbs and chapter titles are only ever saved in English, so a Thai child on a Thai interface still reads "How the Tiger Got His Stripes". The Thai versions are generated during the preview step and then thrown away. A few navigation and system strings are also still English-only.

## 1. Store Thai story text, not just English

- Books gain a Thai title and Thai blurb; chapters gain a Thai title.
- The Thai text the preview already produces is saved with the book instead of discarded, and chapter generation returns a Thai chapter title alongside the English one.
- Everywhere a title or blurb is shown — bookshelf, book page, chapter list, reader header, quiz, vocabulary, progress, share/preview text — it uses the Thai version when the interface is Thai, falling back to English only if Thai is missing.

## 2. Existing books

Books already created have no Thai titles. On the book page and bookshelf they keep working, and a small one-time translation runs per book the first time it is opened while the interface is Thai: it translates the book title, blurb and all chapter titles in a single quick pass and saves them, so the next visit is instant. This costs a fraction of a credit per book and never re-runs.

## 3. Thai-first defaults and sweep

- Thai stays the default language (it already is), and the language toggle is moved to a clearer, larger control so a parent can find it but a child won't flip it by accident.
- Full sweep of every route and component for English-only strings, including: "Page not found" and other error/empty states, the root not-found and error boundaries, browser tab titles and descriptions for each route, `aria-label`s and toast messages, and button text inside the reader, quiz, shop, character creator and create flow.
- Thai renders in Noto Sans Thai with slightly looser line height in child-facing text so tone marks aren't clipped.

## Technical notes

- Migration: `ALTER TABLE public.books ADD COLUMN title_th text, ADD COLUMN blurb_th text;` and `ALTER TABLE public.chapters ADD COLUMN title_th text;` — nullable, no grant or policy changes needed (existing public-read policies cover them).
- `src/lib/story.server.ts`: `createBook` persists `preview.th.title/blurb` into `title_th`/`blurb_th` and the Thai chapter titles into each chapter row; the chapter-generation prompt/schema (`src/lib/story-schema.ts`) gains a required `title_th` field with the same length limits as `title`.
- New server fn `backfillThaiTitles({ bookId })` in `src/lib/story.functions.ts`: no-op if `title_th` is already set; one AI call returning `{ title_th, blurb_th, chapters: [{ idx, title_th }] }`, validated with Zod, written with the service-role client. Called from the book route component via `useServerFn` (never from a loader) and only when `lang === "th"`.
- `src/lib/books.ts`: the book/chapter types gain `titleTh`/`blurbTh`; add a `useStoryText()` helper (or `pickTitle(book, lang)`) so components never hand-pick fields.
- Regenerate `src/integrations/supabase/types.ts` after the migration.
- No change to the coin, progress or audio systems.
