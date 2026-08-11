# Why the pictures load slowly — and the fix

I measured it. Each illustration is a **full-size PNG of about 2 MB** (checked ten of them: 1.8–2.2 MB each). One page image took 2.3 seconds to fetch *inside the datacentre*; on a phone over mobile data that is easily 5–15 seconds. Nothing is broken in the code — the files are simply far too big for what a phone screen shows (about 400 px wide).

Two smaller things add to it:

- The art URL goes to our own server first, which then bounces the browser to a temporary storage link. That is an extra round trip before a single byte of image arrives.
- Since sentences got their own scenes, a chapter now pulls several of these 2 MB files instead of one, so the same page costs more data.

## The fix

**1. Send small, modern images instead of giant PNGs**

Serve the artwork resized to screen size and compressed (WebP), which takes a typical page from ~2 MB to roughly 80–150 KB — a 15–20x reduction. This is the whole fix; everything else is polish.

Preferred route: use the backend's built-in image transformation (width capped at 1080, quality ~70, WebP). If transformation is not available on this project, fall back to generating and storing one resized WebP copy next to each PNG at creation time, and serving that.

Either way, the original PNG stays untouched as the source, and existing books are covered — the first request for an old image produces its small version, then it is cached.

**2. Cut the extra hop**

Make the art bucket public-read and point the reader straight at the storage CDN URL, so the browser fetches the image directly instead of going through our server and a signing step. The images are storybook illustrations, not private data. The existing `/api/public/art/*` route stays as a fallback so already-saved URLs keep working.

**3. Small perceptual wins**

- Give the current illustration a real `width`/`height` and keep the last good image on screen while the new one decodes (already the behaviour) so nothing flashes.
- Preload the next two scene images instead of one, and preload the first image of the next chapter when the reader reaches the last page.
- Add a tiny blurred placeholder derived from the image itself so the page never looks empty.

## Technical notes

- `src/routes/api/public/art/$.ts`: switch the signed-URL call to `createSignedUrl(path, ttl, { transform: { width: 1080, quality: 70 } })`; keep the in-memory signed-URL cache and the streaming fallback. If the transform option errors, fall back to the untransformed signed URL.
- Bucket visibility: flip `story-art` to public via migration, then have `artUrl()` in `src/lib/story.server.ts` emit the public CDN URL (`/storage/v1/render/image/public/story-art/<path>?width=1080&quality=70`) for newly generated art. Old rows keep their `/api/public/art/...` URLs and are served by the route above.
- If transformation is unavailable on this project, add a WebP re-encode step in the illustration worker in `src/lib/story.server.ts` (pure-WASM encoder, no `sharp` — it cannot run in the Worker runtime) writing `<name>.webp` alongside the PNG, and prefer the `.webp` object when serving.
- `src/routes/book.$bookId.chapter.$n.index.tsx`: extend the existing preload effect to `sentenceArt[active + 1]`, `sentenceArt[active + 2]` and the next chapter's first image; no layout changes.

Not touched: prompts, schema, reader layout, writing practice, audio.
