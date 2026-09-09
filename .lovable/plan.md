# A theme tune for each book (experiment)

A small, self-contained test: on a book's page, a "Make a theme tune" button asks Google's music model for about 30 seconds of instrumental music that fits the story, then plays it back. Nothing else about the storybook changes.

## How it will work for you

1. Open any book.
2. Press "Make a theme tune".
3. The app reads the book's title and short summary, decides a genre and mood in words (for example "gentle Chinese folk, bamboo flute and guzheng, 80 bpm, warm and curious"), and shows you that description.
4. It sends that description to Google's music service, gathers roughly 30 seconds of audio, and gives you a play button.
5. The tune is saved with the book, so pressing play later doesn't cost anything again. A "Make another" button re-rolls it.

The button is clearly marked as an experiment and sits at the bottom of the book page, away from the reading flow.

## What I need from you

Google's music model isn't part of the built-in AI, so it needs your own Google AI Studio key (aistudio.google.com → Get API key). Music generation is only enabled on some accounts, so the very first thing I'll do is a throwaway check that your key can actually produce audio — before building any of the button or player. If it can't, I'll stop and tell you, and we can decide whether to try a different music service instead of spending effort on a dead end.

## Steps

1. **Prove the key works.** A one-off test outside the app: connect to the music service, ask for 20 seconds of a simple prompt, save the audio, and confirm it plays and is the right length. Report back with the result before continuing.
2. **Genre writer.** A small server-side step that turns a book's title plus its chapter summaries into a short music description (genre, instruments, tempo, mood) using the AI already in the app. No sung words — this model is instrumental only.
3. **Music maker.** A server-side step that streams audio back from the music service, stops at about 30 seconds, packages it as a playable file, and stores it in the app's own storage next to the book's pictures.
4. **Button and player.** On the book page: the experimental button, a line of text showing the chosen genre, a play/pause control, and a "Make another" option. Clear messages when music isn't set up or the service refuses.
5. **Check it end to end.** Generate tunes for two very different books (a quiet fable and an adventurous one) and confirm the genres differ, both play, and replaying a saved tune makes no new request.

## Deliberately not in scope

- No sung lyrics, no words in the music.
- No music during reading, no chapter-by-chapter scoring, no mixing with the existing gentle background sounds.
- No change to how books are made — existing books simply gain the button.

## Technical notes

- Provider: Google Gemini API's Lyria RealTime music model (`models/lyria-realtime-exp`), which is a WebSocket stream of raw PCM rather than a one-shot file. Step 1 exists precisely to confirm both account access and that a stream can be collected from this runtime; the server runs on Cloudflare Workers, where an outbound WebSocket must use the `fetch` upgrade rather than the Node/`@google/genai` client. If the SDK path proves unusable, step 1 falls back to a raw WebSocket implementation before any UI work starts.
- Key stored as a project secret (`GEMINI_API_KEY`), read only inside server handlers, never sent to the browser.
- New files: `src/lib/music-gen.server.ts` (stream, buffer, WAV-encode PCM at the model's 48 kHz stereo output) and `src/lib/music-gen.functions.ts` (a `makeTheme` server function). The existing `src/lib/music.ts` browser synth is untouched.
- Storage: reuse the existing art bucket and the `/api/public/art/$` serving route, extended to allow a `.wav` extension, or a sibling audio route if that proves cleaner. One small migration adds `books.theme_url` and `books.theme_genre`.
- Generation is triggered by an explicit button only — never on page load — and the stream is capped by duration and byte count so a runaway session cannot bill indefinitely.
