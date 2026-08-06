# Test coins switch

## Where coins live today

- `src/lib/economy.ts` — all the numbers: `STARTER_COINS` (150), `PRICES` (chapter 60, book 150, outfit 40, hat 30, pet 80, voice 100), `REWARDS`, `STREAK_BONUS`.
- `src/lib/progress.ts` — the purse itself: `progress.coins` / `progress.earned`, saved on the device under `storylingo.progress.v1`. `give()` adds coins, `spend()` / `buyItem()` / `buyChapter()` take them away.
- `src/components/CoinPurse.tsx` — the pill in the header showing the balance.

## Change

Add a URL test switch next to the existing `?unlockAll=1` one:

- Visiting any page with `?coins=9999` sets the purse to that amount (any number works, e.g. `?coins=500`).
- Plain `?coins=1` style values still work, so you can also test the "not enough coins" states.
- It writes to the real saved progress, so the balance sticks until you change it again — deliberate, so you can browse the shop, buy, and see spending work normally.

Also expose `window.storylingoCoins(n)` in development, so coins can be topped up from the browser console without a reload.

## Technical notes

- New `useTestCoins()` in `src/lib/progress.ts` reads the `coins` query param after hydration and calls `update()` to set `coins`/`earned`; guarded to run once per value so it doesn't fight normal spending.
- Mounted once in `src/routes/__root.tsx` so it works on every page.
- The console helper is registered in the same hook behind an `import.meta.env.DEV` check.
