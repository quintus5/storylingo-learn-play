## The bug

Your source is a PDF. `fetchStoryText` (`src/lib/story.server.ts`) fetches the URL, runs HTML tag-stripping regexes over it, and accepts the result if it is longer than 200 characters. Raw PDF bytes survive that check as meaningless characters, so the model got junk and invented a panda story that has nothing to do with your document.

Both existing books in the shelf came from that PDF link, so both are fabricated.

## Fix

**1. Detect the content type before parsing**

In `fetchStoryText`, read the `Content-Type` header and the URL extension, then branch:
- `text/html` → existing tag-stripping path
- `application/pdf` → PDF text extraction path
- `text/plain` → use as-is
- anything else (images, video, octet-stream) → throw a clear error: "That link isn't a readable story page or PDF."

**2. Extract real PDF text**

Add an `unpdf`-style pure-JS PDF text extractor (no native binaries — the server runs on a Worker runtime, so `pdf-parse`/`canvas`-based libraries won't work). Download the PDF as an ArrayBuffer and pull the text layer out.

If the PDF is scanned images with no text layer, throw: "That PDF has no readable text — it looks like scanned images."

**3. Guard against garbage text reaching the AI**

Add a sanity check after extraction: the text must contain a reasonable ratio of letter/CJK characters to total characters. If it fails, reject with a clear message rather than handing nonsense to the model. This is the check that would have caught your PDF today.

**4. Surface the failure in the UI**

The create page already shows errors — make sure these new messages come through as the friendly text above rather than a generic "Something went wrong."

## Cleanup

Delete the two fabricated books (and their storage art) so the shelf starts clean, then you can re-run your PDF link.

## Out of scope

File upload of a local PDF, and DOCX/EPUB sources — say the word and I'll add PDF upload too.
