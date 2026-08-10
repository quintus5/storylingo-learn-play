# Consistent characters and places across every chapter

## Answer first: no, anchors are not implemented

I checked the generation code. What exists today:

- Each page image is painted from three things only: the art-style text, the free-form "scene" sentence the writer model invented for that page, and (optionally) the child's own buddy description (`character_prompt` on the book).
- There is no stored description of the story's own cast (the tiger, the grandmother, the boy) and no stored description of recurring places (the village, the cave, the river).
- `extractPlotSpine` does list character names during planning, but those names are never carried into the illustration prompts — the painter only sees the scene sentence.

So every page is painted from scratch. The model re-invents the tiger's face, the boy's clothes and the village each time, which is exactly the inconsistency you are seeing between chapters.

## The fix: a story bible, built once per book

**1. Write a cast + place bible once, when the book is created.**
A single analysis pass over the source produces, for each important character, a fixed visual description (age, build, face, hair, clothing colours, distinguishing marks) and for each recurring place a fixed description (architecture, landscape, palette, time of day). No reference images are painted — it is text only, written one time per book and saved with the book.

**2. Reuse that same text in every page prompt, for the whole book.**
When painting any page in any chapter, the exact stored descriptions of the characters and place in that scene are prepended to the prompt, word for word, plus an instruction that they must look identical to their other appearances. Because the wording never changes across chapters, the tiger stays the same tiger.

**3. Make the writer tag its scenes.**
The chapter writer already invents a `scene` per page. It will also return which cast names and which place that page shows, so the right bible entries are picked reliably instead of by keyword guessing.

**4. Keep the child's buddy as-is.**
The existing buddy prompt keeps working and simply becomes one more locked entry in the bible.

## Existing books

Books generated before this change have no bible. Add a per-book "Repaint pictures" action in the developer menu that writes the bible and re-illustrates the pages, so you can fix the inconsistent books you already have without regenerating the text.

## Technical notes

- Migration: add `cast jsonb` and `places jsonb` to `books` (each entry: name, description). Nullable, so old books keep working. No anchor image column.
- `src/lib/story.server.ts`: new `buildStoryBible(storyText, spine)` called once per book; `makeArt` gains an optional `refs` parameter that prepends locked cast/place descriptions ahead of the scene.
- `src/lib/story-schema.ts`: page schema gains optional `cast: string[]` and `place: string`; tolerant repair, missing fields fall back to empty.
- `src/lib/story.functions.ts`: bible is built in the create step; `generateChapter` reads `cast`/`places` from the book row and passes matched entries into `illustratePages`.
- `src/lib/story-schema.test.ts`: fixtures for pages with missing or malformed `cast`/`place`.
- Cost impact: one extra text analysis call per book. No extra images.

