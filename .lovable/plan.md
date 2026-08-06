# Unlock everything for testing

## Right now, no code change needed

Add `?unlockAll=1` to any page URL — every outfit, hat and pet becomes selectable for the rest of the browser session.

For coins, paste this in the browser console on the app, then reload:

```js
const k="storylingo.progress.v1";const p=JSON.parse(localStorage.getItem(k)||"{}");
localStorage.setItem(k,JSON.stringify({...p,coins:99999,earned:99999}));location.reload();
```

## Change to make it one switch

Extend the existing test switch in `src/lib/progress.ts` so `?unlockAll=1` also:

- Tops the purse up to 99,999 coins.
- Marks every chapter of every book unlocked (`isUnlocked` returns true while the switch is on).
- Treats every shop item as owned, so the shop shows them all as buyable/owned and the character screen has nothing locked.

The switch stays session-only and never overwrites real saved progress except the coin top-up, which is what makes purchases testable end to end.

## Technical notes

- `useTestUnlock()` gains the coin top-up (once per session) and is mounted in `src/routes/__root.tsx` so it applies on every page, not just the character screen.
- `owns()` and `isUnlocked()` take the session flag into account via a module-level `testUnlockOn` boolean set by the hook.
- Shop and reader screens already call `owns()` / `isUnlocked()`, so they pick this up with no further edits.
