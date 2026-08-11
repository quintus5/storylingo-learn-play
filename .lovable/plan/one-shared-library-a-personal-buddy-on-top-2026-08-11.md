# One shared library, a personal buddy on top

## The real problem

Books are shared by everyone, but each child's buddy is currently **painted into the illustrations** at generation time. That forces a choice between "everyone sees someone else's buddy" and "generate a private copy of every book for every child" — which multiplies image generation cost and storage per user.

There is a third option that avoids both: stop baking the buddy into the picture, and draw it on top of the page instead. The app already has a full painted sprite system (`CharacterSprite`) used on the bookshelf, shop and writing practice.

## What changes

**1. Illustrations become buddy-free**
- The recurring-companion paragraph is no longer appended to art prompts. Pictures show only the story's own characters and setting.
- One set of images per book, shared by all children, exactly as today. No new storage, no per-user generation, no accounts needed.

**2. The buddy appears as an overlay in the reader**
- The child's saved character is drawn in a corner of the illustration area as their own sprite, sized small so it never covers the scene or the subtitle strip.
- It is read from the device as it already is, so every child sees their own buddy on the same shared book.
- It can be toggled off from the reader if a child wants a clean picture.

**3. Old books keep working**
- Books already generated with a buddy baked in keep their pictures. For those books the overlay is skipped so there aren't two buddies on the page.
- Nothing is migrated or regenerated.

## Why not the alternatives

- **Private books per child**: needs sign-in plus a full generation and image set per child per book — the most expensive option, and it breaks the shared shelf.
- **Offline app with a personal API key**: children (and parents) would have to obtain and paste an API key, and every book would be generated from scratch on each device. Much worse cost and setup for the same result.

If you later want each child to make *their own* stories too, the natural follow-up is a shared public shelf plus a small "my books" section behind sign-in — that can be added on top of this without redoing anything.

## Technical notes

- `src/lib/story.server.ts`: drop the `buddy` block from `makeArt`; keep the signature tolerant so existing callers compile.
- `src/lib/story.functions.ts` / `src/routes/create.tsx`: stop sending `characterPrompt` on new books. The `books.character_prompt` column stays as the marker for legacy baked-in books.
- Reader (`src/routes/book.$bookId.chapter.$n.index.tsx`): render `CharacterSprite` positioned over the illustration layer, only when `book.character_prompt` is empty and a character exists. No layout, audio or writing-practice changes.
