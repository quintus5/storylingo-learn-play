# The pictures ARE 16:9 — the delivery step is cropping them

## What I found

Good news first: the generation fix worked. I pulled the stored original for the newest book ("The Mad Goose and the Tiger Forest") straight out of storage and measured it:

- stored original: **2560 x 1440** — exactly 16:9
- what the app actually serves: **1080 x 1440** — a 3:4 crop

Every image of that book comes back the same shape, anchors included, so it is not the model.

The cause is in the image-serving route (`src/routes/api/public/art/$.ts`). It asks storage for a resized copy with a width only (`width: 1080, quality: 68`). Storage fills in the missing height itself and resizes in **cover** mode, which crops. The signed link it hands back literally reads `width:1080, resize:undefined`. So a perfect widescreen picture is centre-cropped to portrait on its way to the screen — which is also why the reader looked so zoomed-in on the phone.

## The fix

1. **Ask for a fit, not a crop.** Request an explicit box with `resize: "contain"` (fit inside, never crop) — 1280 x 720 for reader art, so any shape, including the old portrait books, arrives whole and correctly proportioned.
2. **Never silently crop again.** If the transform can't be built, keep today's fallback of serving the raw stored object, which is already the true 16:9 file.
3. **Bookshelf thumbnails** use the same contain-style box at a smaller size, so covers stop being cropped too.
4. **Verify by measuring**, not by eye: after the change, re-fetch the cover and a chapter page through the app's own URL and confirm the served pixels are 16:9.

## Secondary, same area

The newest book's art is stored as a 380 KB JPEG rather than the intended WebP, which means the compression step is falling back to passthrough. It is not the ratio bug and not urgent, but I can look at why in the same pass if you want.

## Technical notes

- `src/routes/api/public/art/$.ts`: change `TRANSFORM` from `{ width: 1080, quality: 68 }` to `{ width: 1280, height: 720, resize: "contain", quality: 68 }`; keep the untransformed signed-URL fallback, the ETag/304 path and the cache headers exactly as they are.
- No regeneration, no migration, no database change — existing books are already correct on disk.
