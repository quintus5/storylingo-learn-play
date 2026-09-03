# Anchor images for real character and background consistency

## What I found

The text-only "story bible" is working: the newest book has four locked character descriptions and three place descriptions, its pages are correctly tagged (`Mr. Rabbit`, `Mistress Puss`, `Deep Forest`...), and those descriptions are pasted into every illustration prompt. So the wiring is fine — the approach is what falls short. A paragraph of words ("teal-blue vest, cream chest") is re-interpreted by the image model on every call, so the rabbit's face changes from picture to picture. Words alone cannot lock a face.

On the ratio: the stored cover of the newest book is 1080x2048 (portrait). That book was painted before the widescreen size was pinned, so it is old art — but nothing in the code verifies what actually came back, so a silently portrait result would go unnoticed again.

## The fix: paint the anchors once, then reference them

The image model accepts reference images, not just text. That is the missing piece.

**1. Anchor images, made once per book, at creation time.**
After the bible is written, paint two small sets of reference pictures and store them with the book:
- A **character sheet** per main character (up to 4): the character alone, full body plus a head close-up, on a plain neutral background, painted in the book's art style.
- An **establishing view** per recurring place (up to 3): the location empty of characters, same style, fixed palette and time of day.

**2. Every page picture is generated from those anchors.**
When painting a page, the anchor images for the characters and place that page is tagged with are attached to the request as visual references, alongside the existing locked text and an explicit instruction that the characters must match the reference exactly — same face, same clothes, same colours — and the location must match the establishing view. Same rabbit, same forest, every chapter.

**3. Richer, more directed page prompts.**
The current prompt hands the model one loose scene sentence. It gains explicit structure: who is in frame and what each is doing, where it happens, camera framing (wide / medium / close), and lighting — derived from the scene text the writer already produces, plus the bible.

**4. Ratio, verified instead of assumed.**
Keep the explicit 16:9 request, but check the pixel dimensions of what comes back. If the model returned a portrait image, log it loudly and re-request once with an alternative widescreen size, so a wrong ratio can never silently reach the bookshelf again.

**5. Existing books.**
Nothing is migrated automatically. The developer-mode **Repaint** button gains anchor generation: it writes the bible if missing, paints the anchors, then re-illustrates every chapter with them. Use it on the books you care about.

## Cost

Anchor generation adds roughly 4-7 extra images per book, once. Per-page image count is unchanged. Text calls are unchanged.

## Technical notes

- Migration: add `anchors jsonb` to `books` — `{ cast: [{name, path}], places: [{name, path}] }`. Nullable; old books keep working. Standard GRANTs unchanged (existing table).
- `src/lib/ai.server.ts`: `generateIllustration(prompt, refs?: string[])` passes `image: [...]` (signed URLs from the art bucket, or base64) to the Seedream request; adds a dimension check on the decoded bytes and one retry with a fallback widescreen size when the aspect ratio comes back wrong.
- `src/lib/story.server.ts`: new `buildAnchors(bookId, bible, styleId)` painting and uploading `anchor-cast-<slug>.webp` / `anchor-place-<slug>.webp`; `makeArt` gains `refPaths: string[]` and composes the structured prompt; `illustratePages` resolves each page's tagged cast/place to anchor paths via the existing `matchBibleEntries`.
- `src/lib/story.functions.ts`: create flow calls `buildAnchors` after `buildStoryBible` and stores `anchors`; `generateChapter` and `repaintBook` read `anchors` and pass them down; repaint regenerates anchors when absent.
- Anchor generation failures are non-fatal: the book falls back to today's text-only locking rather than failing to build.
- Verification: create one fresh book end to end, confirm anchors exist in storage, confirm every generated page image is 16:9, and eyeball two chapters for the same character.
