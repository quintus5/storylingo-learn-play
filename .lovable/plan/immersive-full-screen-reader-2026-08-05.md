# Immersive full-screen reader

Yes — this will be better. Right now the illustration is a pinned strip at the top and the sentences push it around, so the picture never feels like a picture book. The new reader turns each page into one cinematic screen: the art fills the viewport, and the words sit on top of it in a glass panel that gets out of the way while you listen.

## How it will feel

- The chapter illustration covers the whole screen (edge to edge, behind the header), gently zooming as the page settles.
- A soft dark gradient rises from the bottom so text stays readable on any artwork.
- The sentences live in a translucent panel anchored to the bottom third. It scrolls internally if the page is long, so the art never gets pushed off screen.
- "Read to me" auto-dims the panel to a single highlighted sentence line — the picture takes over while narration plays; the full panel returns when playback ends.
- Tapping anywhere on the artwork toggles the panel between compact (art-first) and expanded (text-first). A small chevron handle shows it is draggable/tappable.
- Page turns cross-fade the artwork and slide the text panel in the direction of travel; no scroll jump.
- Controls (back, narrator, music, play) become floating pill buttons over the art instead of a solid header bar. Page arrows and "Page 2 of 8" sit as a slim bar at the very bottom.
- Word taps still open the existing word popup, unchanged.

## Reading behaviour

- On page change the text panel resets to compact so the illustration is seen first.
- Scrolling inside the panel expands it smoothly; scrolling back down collapses it.
- When narration finishes, the panel expands so the reader can review the full page.
- All motion respects reduced-motion; with it on, panel/art changes are instant fades.

## Technical notes

- Rewrite `src/routes/book.$bookId.chapter.$n.index.tsx` to render its own full-bleed layout instead of `AppShell` (AppShell stays for bookshelf, book landing, quiz, vocabulary).
- New local state: `panel` = "compact" | "expanded", driven by tap, internal scroll position, and narration start/end.
- Art layer: absolutely positioned `img` with `object-cover`, `inset-0`, plus a `bg-gradient-to-t` overlay; per-page `key` for the cross-fade.
- Text panel: fixed bottom container with `max-h` transition between ~38vh and ~78vh, `overflow-y-auto`, `backdrop-blur`, using existing card/border tokens (no hardcoded colours).
- Add tokens for the scrim gradient and panel glass in `src/styles.css`, plus a `ken-burns` keyframe and a reduced-motion guard alongside the existing animations.
- Header controls move into the route as floating buttons; keep the existing voice, music and playback handlers untouched.
- Quiz, vocabulary and generation flows are not modified.
