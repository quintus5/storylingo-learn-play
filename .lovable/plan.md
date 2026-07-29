## Goal

1. Harden the AI-generated story JSON with real schema validation, and prove it with unit tests that feed malformed fixtures.
2. Let users generate as few as 1 chapter — the slider starts at 1 (currently the slider and server validator both require 8–10).

## Current state (verified)

- `src/lib/story.functions.ts` validates *user* input with Zod, but the *model output* (`buildOutline`, `buildChapterContent` in `src/lib/story.server.ts`) is only loosely filtered — `pages.filter(p => p.sentences?.length)` and a truthy check on `hanzi`/`pinyin`. Missing `native`, empty `words`, non-string fields, or a page of junk would flow into the reader.
- No test runner is installed (no vitest, no test files).
- `create.tsx` slider is `min={8}`; server schema is `min(8).max(10)`.

## 1. Extract validators into a testable, client-safe module

New `src/lib/story-schema.ts` (plain module, no server imports so tests run fast):

- `WordSchema`, `SentenceSchema`, `PageSchema`, `ChapterContentSchema`, `OutlineSchema` built with Zod, mirroring `src/lib/types.ts`.
- Rules that matter for the reader: non-empty `hanzi`/`pinyin`/`native`/`dict` strings after trim, `words` non-empty per sentence, each page ≥1 sentence, chapter ≥1 page, top-level `words` ≥1, outline chapters each with title + summary.
- Lenient-but-safe repair pass: `parseChapterContent(raw)` drops individually invalid sentences/words/pages (models often produce one bad row), then requires the surviving structure to be non-empty — otherwise throws a clear `StoryValidationError` with the Zod issue paths.
- Same for `parseOutline(raw, expectedCount)`.

## 2. Wire into generation

`story.server.ts` calls `parseChapterContent` / `parseOutline` instead of the ad-hoc filters. `buildChapterContent` retries the model once on validation failure before throwing, so a single bad generation doesn't kill the whole book.

## 3. Unit tests

Install `vitest` (dev dependency), add a `test` script and a minimal `vitest.config.ts` with the `@/` alias.

New `src/lib/story-schema.test.ts` with fixtures:

| Fixture | Expectation |
| --- | --- |
| valid chapter | parses unchanged |
| `pages: []` / missing `pages` | throws |
| page with `sentences: []` | page dropped; throws only if no pages remain |
| sentence missing `native` | that sentence dropped, rest kept |
| sentence with empty-string `hanzi` / whitespace only | dropped |
| `words` containing non-object / missing `dict` | bad words dropped, sentence kept if any remain |
| top-level `words: []` | throws |
| model returned a JSON string, array, or `null` instead of object | throws, no crash |
| extra unknown fields | ignored, parse succeeds |
| outline with wrong chapter count / missing summary | throws or drops per spec |

Assertions check both that bad input throws `StoryValidationError` and that surviving good data is intact.

## 4. Chapter count starts at 1

- `create.tsx`: slider `min={1}` (range 1–10), default stays 8, label reads "1 chapter" in the singular.
- Server: `chapterCount` schema becomes `min(1).max(10)`; the `chapters.length < 2` guard in `createBook` relaxes to `< 1`.
- Outline prompt gets a note so a single chapter reads as a complete mini-story.
- Reader/quiz unlock logic already keys off `chapter_count`, so a 1-chapter book finishes after one quiz — no change needed there.

## Technical notes

- Validators live in a client-safe file (not `*.server.ts`) so vitest can import them with no Supabase or worker mocks.
- No database or schema changes.
