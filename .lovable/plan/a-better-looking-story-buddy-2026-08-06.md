# A better-looking story buddy

Replace the hand-coded SVG buddy with a painted sprite kit that matches the watercolour storybook art, keeping everything instant and offline.

## What changes for the reader

The buddy stops looking like a flat vector doodle and starts looking like it was lifted out of one of the picture books: soft watercolour edges, warm paper texture, gentle shading. Same choices as today (skin, hair, hair colour, eyes, outfit, hat, pet) — nothing the kid already owns is lost.

Two versions of the buddy:
- **Full body** on the character screen, the shop and the quiz cheer — shows the outfit, hat and pet properly.
- **Head-and-shoulders bust** for small spots: the coin bar, the bookshelf card, the reader corner.

## How the art gets made

I paint the pieces once, up front, as transparent PNG layers and bundle them with the app — no API key, no network call, nothing generated per child.

Layer stack (back to front): pet → body+outfit → head+skin → back hair → face/eyes → front hair → hat.

Piece counts (full body + bust where the piece is visible in a bust crop):
- 4 skin tones × body base and head
- 5 hair styles × 5 hair colours (painted per colour so the watercolour reads properly, not tinted)
- 4 eye/expression sets
- 6 outfits
- 4 hats
- 4 pets (full body only)

Everything is drawn on one fixed 512×512 canvas with a shared pose and anchor points so the layers always line up. Pieces are uploaded as CDN assets rather than committed binaries, so the repo stays light.

## Consistency with the book pictures

The illustrator prompt (`characterPrompt`) stays as it is — the sprite and the painted book pages already describe the same child, and the new sprite style makes them visibly match.

## Technical notes

- New `src/lib/character-art.ts`: a manifest mapping each option id (plus skin/hair-colour combination) to its asset URL, for both `full` and `bust` crops.
- `src/components/CharacterSprite.tsx` is rewritten as a layered `<img>` stack inside an aspect-square container, with a `variant: "full" | "bust"` prop (default `full`). Same props otherwise, so existing call sites keep working; small call sites switch to `variant="bust"`.
- Layers use `loading="lazy"` except the first paint on the character screen, and a low-cost CSS drop shadow grounds the figure.
- The old inline SVG stays as a fallback while art loads and if a piece 404s, so the buddy never renders empty.
- No changes to `src/lib/character.ts` option ids, `progress.ts`, the economy, or the shop's ownership logic.
- Art is generated into `src/assets/character/`, then externalised with the assets CLI to `.asset.json` pointers.

## Scope note

This is roughly 60 painted pieces. I'll generate them in batches and check them together on a contact sheet before wiring the renderer, so we can adjust the style once rather than piece by piece.
