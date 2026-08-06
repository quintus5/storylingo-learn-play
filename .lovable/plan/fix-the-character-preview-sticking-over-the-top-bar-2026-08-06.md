# Fix the character preview sticking over the top bar

## Problem

On the My character screen the preview card is pinned to the very top of the
scroll area with a higher stacking order than the app header, so when you scroll
it slides on top of the "My character" bar and the back button/coins.

## What changes

1. Stop the preview from covering the header
   - Pin it just below the header instead of at `top: 0`, and put it behind the
     header in stacking order so the header always wins.
   - Give it a small top gap so it reads as a separate card, not a merged strip.

2. Turn it into a vertical card on wide screens
   - On desktop/tablet the picker area becomes two columns: a vertical preview
     card on the left (buddy portrait above the name field) that stays put while
     the options list on the right scrolls freely.
   - On mobile it stays the current horizontal card, but correctly offset below
     the header.

3. Keep the sprite itself steady
   - No re-layout of the sprite while scrolling: only the wrapper is sticky, the
     sprite keeps its fixed size, so no reflow or flicker.

## Technical notes

- `src/routes/character.tsx` only (presentation): change the sticky wrapper from
  `sticky top-0 z-30` to a header-aware offset with a z-index below the header's
  `z-20`, and wrap the preview + option card in a responsive grid
  (`lg:grid-cols-[minmax(0,18rem)_1fr]`) with the preview column sticky.
- Header in `src/components/AppShell.tsx` stays as is.
- No logic, storage, or character-art changes.
