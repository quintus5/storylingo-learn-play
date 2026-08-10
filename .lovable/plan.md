# Consistent characters and places across every chapter

## Answer first: no, anchors are not implemented

I checked the generation code. What exists today:

- Each page image is painted from three things only: the art-style text, the free-form "scene" sentence the writer model invented for that page, and (optionally) the child's own buddy description (`character_prompt` on the book).
- There is no stored description of the story's own cast (the tiger, the grandmother, the boy) and no stored description of recurring places (the village, the cave, the river).
- `extractPlotSpine` does list character names during planning, but those names are never carried into the illustration prompts — the painter only sees the scene sentence.

So every page is painted from scratch. The model re-invents the tiger's face, the boy's clothes and the village each time, which is exactly the inconsistency you are seeing between chapters.

## The fix: a story bible, built once per book

**1. Build a cast + place bible when the book is created.**
One analysis pass over the source produces, for each important character, a fixed visual description (age, build, face, hair, clothing colours, distinguishing marks) and for each recurring location a fixed description (architecture, landscape, palette, time of day). Store it on the book so every chapter uses the same text.

**2. Paint one anchor image per main character and main place.**
Top few characters and locations get a single reference illustration in the book's art style, saved to storage. These become the visual ground truth for the book.

**3. Inject the bible into every page prompt.**
When painting a page, detect which cast members and which place appear in that page's scene, and prepend their exact stored descriptions plus a "these must look identical to their earlier appearances" instruction. Where the model supports it, also pass the anchor image as a visual reference.

**4. Make the writer tag its scenes.**
The chapter writer already invents a `scene` per page. It will also return which cast names and which location that page shows, so the matching in step 3 is reliable instead of keyword-guessing.

**5. Keep the child's buddy as-is.**
The existing buddy prompt keeps working and simply becomes one more locked entry in the bible.

## Existing books

Books generated before this change have no bible. Add a per-book "Repaint pictures" action in the developer menu that builds the bible and re-illustrates the pages, so you can fix the inconsistent books you already have without regenerating the text.

## Technical notes

- Migration: add `cast jsonb` and `places jsonb` to `books` (each entry: id, name, description, anchor_url). Nullable, so old books keep working.
- `src/lib/story.server.ts`: new `buildStoryBible(storyText, spine, styleId)`; new `paintAnchors()` writing to the `story-art` bucket under `<bookId>/anchor-<slug>.png`; `makeArt` gains an optional `refs` parameter that prepends locked cast/place descriptions ahead of the scene.
- `src/lib/story-schema.ts`: page schema gains optional `cast: string[]` and `place: string`; tolerant repair, missing fields fall back to empty.
- `src/lib/story.functions.ts`: bible is built and anchored in the create step; `generateChapter` reads `cast`/`places` from the book row and passes matched entries into `illustratePages`.
- `src/lib/story-schema.test.ts`: fixtures for pages with missing or malformed `cast`/`place`.
- Cost impact: one extra analysis call per book plus roughly 4-6 extra images per book, paid once at creation rather than per page.
