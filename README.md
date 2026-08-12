# StoryLingo

Turn any children's story into an interactive, illustrated language-learning picture book.

Built for young learners who want to read Mandarin while keeping their native Thai close by. StoryLingo retells public-domain or user-provided stories, breaks them into illustrated chapters, and layers every sentence as **Hanzi · Pinyin · Thai** with read-aloud, word popups, quizzes, and writing practice.

---

## Live app

- **Published:** https://storylingo-learn-play.lovable.app

---

## Features

- **Bookshelf home** — Browse generated books with progress bars and locked chapters.
- **Chapter reader** — Full-screen, sentence-by-sentence reading with crossfading illustrations, three-layer text, audio narration, and tap-to-define word popups.
- **Per-sentence scenes** — Illustrations change as the story moves, not just once per page.
- **Audio** — TTS narration with voice selection, slow audio for individual words, and browser caching.
- **Quizzes** — Matching, listening, and translation rounds per chapter; distractors pulled from learned chapters.
- **Writing practice** — Sentence-scoped Hanzi stroke practice with guided hints, auto-replay, and coin rewards.
- **Vocabulary page** — Review starred and learned words from each book.
- **Progress & coins** — Local-first progress tracking plus cloud sync, character creator, outfits/hats/pets, and streak bonuses.
- **Culture-aware art styles** — Chinese ink-wash, Thai mural, modern watercolor, and more.

---

## Tech stack

- [TanStack Start](https://tanstack.com/start) — full-stack React framework
- [TanStack Router](https://tanstack.com/router) — file-based routing
- [React 19](https://react.dev)
- [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Lovable Cloud](https://lovable.dev) — backend, auth, storage
- [Supabase](https://supabase.com) — database and object storage (via Lovable Cloud)
- AI generation pipeline — story retelling, sentence splitting, word glosses, TTS, and illustration prompts

---

## Development

```bash
# Install dependencies
bun install

# Run the dev server
bun run dev

# Run tests
bun test
```

The dev server starts at `http://localhost:8080`.

### Useful routes

| Route | Purpose |
|-------|---------|
| `/` | Bookshelf |
| `/create` | Generate a new book |
| `/book/:bookId` | Book overview / chapter list |
| `/book/:bookId/chapter/:n` | Reader + writing practice |
| `/book/:bookId/chapter/:n/quiz` | Chapter quiz |
| `/shop` | Coin shop for buddy cosmetics |
| `/character` | Buddy creator |
| `/dev.sprite-grid` | Visual regression grid for character sprites (dev only) |

### Dev mode

Click the moon logo in the top-left to open a hidden developer menu. Dev options include chapter unlock, instant coin grants, and regenerating a book’s pictures.

You can also add `?unlockAll=1` to a chapter URL to bypass locks during testing.

---

## Project structure

```
src/
  routes/             # TanStack file routes
  components/         # Reusable UI components
  lib/                # Business logic, AI prompts, schema validators
  hooks/              # Custom React hooks
  integrations/       # Supabase clients
supabase/             # Migrations and config
public/               # Static assets
```

---

## Image pipeline

Generated images are resized and encoded to WebP at generation time (1280px max, quality 78). A 480px thumbnail is produced for covers. The public art route serves signed URLs with ETag / 304 fallback. Existing books stored as PNG continue to work unchanged.

---

## License

This is a Lovable project. The code is yours to keep and modify.

---

## Syncing to GitHub

To back up or collaborate on this codebase, use **Lovable Git sync**:

1. Open the project in the [Lovable editor](https://lovable.dev).
2. Go to **Settings → GitHub**.
3. Connect a GitHub repository (create a new one or link an existing repo).
4. Lovable will push the current project state — including this README — to the linked repository.

You can also use the **Publish** action in the editor to deploy the latest build to your live URL.
