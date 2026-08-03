# Culture-aware art styles

Right now every book is painted in one fixed style (warm desert-night watercolor), no matter whether the story is a Chinese fable, a Grimm tale, or a Thai folk story. This makes the art match the story's origin and period.

## How it works

**1. A style library**

A small set of hand-written art-direction presets, each a full painting instruction:

- Chinese classical — ink-wash (shuǐmòhuà) on rice paper, calligraphic brush strokes, misty negative space, muted ink + cinnabar accents
- Japanese — ukiyo-e woodblock, flat colour fields, bold outlines
- European fairy tale — soft pastel and gouache, Golden Age storybook illustration, carved-relief and sculptural detail
- Thai / Southeast Asian — temple-mural line work, gold leaf, warm tropical palette
- Middle Eastern — Persian miniature, ornamental borders, jewel tones
- African folktale — bold textile patterns, earth pigments, batik texture
- Indian — Madhubani/Pattachitra motifs, dense pattern, saturated colour
- Modern / unknown origin — the current warm watercolor storybook style (default fallback)

Every preset keeps the shared child-safe rules: gentle, friendly, rounded shapes, no text or letters in the image.

**2. The AI picks one when it reads the story**

During the fetch-and-preview step, the model already returns a title, blurb and chapter plan. It also returns a `style` key chosen from the list above, plus a one-line reason ("Chinese fable, Tang dynasty setting"). The chosen style is saved on the book so cover, chapter and page illustrations all use it consistently.

**3. You can override it**

The preview card shows the detected style ("Chinese ink-wash — detected from a classical Chinese fable") with a dropdown to change it before generating. Whatever is showing when you hit generate is what gets painted.

## Technical notes

- New `src/lib/art-styles.ts` exporting the preset id → prompt map and the id union.
- `books` table gets an `art_style` text column (nullable, defaults to the fallback preset).
- `previewStory` prompt gains the `style` field, validated against the preset ids; anything unrecognised falls back to the default.
- `createBook` accepts an `artStyle` input and persists it; `makeArt` takes the style prompt as an argument instead of importing the fixed `ART_STYLE` constant.
- `generateChapter` reads `art_style` off the book row and passes it into `illustratePages` and the cover call.
- `ART_STYLE` in `ai.server.ts` becomes the "modern" preset in the new file.

## Not included

Re-painting books that already exist — new styles apply to newly generated books only. Say the word if you want a "re-illustrate this book" button too.
