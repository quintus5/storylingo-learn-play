# Coins + My Character

Two connected systems: kids earn coins by reading and playing, and spend them on costumes for a character of their own who is drawn into the story pictures. All play-money — no real payments.

## 1. Coins

Coins live with the existing on-device progress data (same place stars and streaks are stored today), so nothing needs an account.

Earning:
- 1 coin per correct quiz answer, plus a 5-coin bonus per star earned on a chapter quiz.
- 10 coins the first time a chapter is read to the last page.
- 15-coin daily streak bonus (the streak counter already exists).
- 1 coin the first time each new word popup is opened (once per word, ever).

A coin purse pill sits in the top bar of the bookshelf, reader and quiz. Coins fly into it with a small animation when earned (respects reduced-motion).

Spending:
- Unlock the next chapter without passing the quiz — 50 coins.
- Create a new book — 150 coins. If the purse is short, the create screen shows how many coins are missing and what to play to get them.
- Costumes and accessories for the character — 20-120 coins each.
- Extra narrator voice and bookshelf themes — 100 coins each.

A parent "gift coins" button lives on the existing progress page, so an adult can top up.

## 2. My Character

A new "My Character" screen (reachable from the bookshelf) where the kid builds an avatar from picked options: body/skin tone, hair style and colour, eye style, face expression, plus an outfit, a hat, and a pet companion from the shop.

The character is drawn as a layered cartoon from a small set of AI-generated sprite pieces bundled with the app (not generated per kid), so it renders instantly and works offline. It appears as a small buddy on the bookshelf, in the reader corner, and cheering on the quiz results screen.

### The character inside the story pictures

When a book is generated, the character's current look is written into every illustration prompt as a recurring child companion travelling through the story — the same described child appears on every page of that book, so the pictures stay consistent.

Two consequences to be clear about:
- Pictures already painted don't change when the kid buys a new hat. New books and newly generated chapters use the current look.
- A "repaint this chapter with my new look" button is offered for 80 coins, which regenerates that chapter's page art.

If no character has been created yet, books generate exactly as they do today.

## Shop

One "Shop" screen with tabs: Costumes, Pets, Voices, Themes. Owned items show a check; unaffordable items show the price greyed with a "keep playing" hint. Everything owned is stored on-device alongside progress.

## Technical notes

- `src/lib/progress.ts` gains `coins`, `spent`, `owned: string[]`, `character`, and `coinsAwarded` (dedupe keys so a reread can't farm coins). Existing saved progress upgrades cleanly with defaults.
- New `src/lib/economy.ts`: prices, earn rules, `earn()` / `spend()` helpers, plus a `useCoins()` hook.
- New `src/lib/character.ts`: character shape, the option catalogue, and `characterPrompt()` which turns a look into one English sentence for the illustrator.
- New `src/components/CharacterAvatar.tsx` (layered sprite renderer), `CoinPurse.tsx`, `CoinBurst.tsx`.
- New routes: `src/routes/character.tsx` (creator) and `src/routes/shop.tsx`, each with its own head metadata.
- `isUnlocked()` in progress also returns true when the chapter was bought with coins.
- `createBook` / `generateChapter` in `src/lib/story.functions.ts` accept an optional `character` description string; `illustratePages` and `makeArt` in `src/lib/story.server.ts` append it to the scene prompt. The description is stored on the book row so later chapters match — this needs one migration adding a nullable `character_prompt` column to `books`.
- Sprite art pieces are generated once into `src/assets/character/` and imported normally.
- Unit tests for `economy.ts` (earning caps, dedupe, spend-when-broke) and `characterPrompt()`.
