# Fix: Chinese-language story links are rejected as "unreadable"

## What's actually wrong

The link works. I fetched `guwendao.net/guwen/bookv_ef5866d11f0a.aspx`: it returns HTTP 200, UTF-8 HTML, and the extractor pulls out 953 characters of clean text — the real 学而篇第一 passage.

It then gets thrown away by the readability guard. That guard counts "readable" characters using a whitelist of letters plus **Western** punctuation (`. , ! ? ' " — -`). Chinese text uses fullwidth punctuation — `：` `，` `。` `？` `“” ` `·` — which the whitelist doesn't include, so this page scores 0.76 against a 0.80 threshold and is rejected with "it looks like a file StoryLingo can't read."

So every Chinese (and Japanese/Thai-punctuated) source page is at risk of being refused, not just this one.

## The fix

Rewrite the guard so it detects *actual* binary junk instead of penalising non-Latin punctuation:

- Count any Unicode letter, mark, digit, whitespace **or punctuation/symbol** as readable — this covers CJK fullwidth punctuation, quotes and interpuncts.
- Reject on the real signal of a bad decode: control characters and replacement characters (`\uFFFD`) above a small fraction of the text.
- Keep the existing "too little text" check, and keep the PDF/scanned-image message unchanged.

Also lower the minimum-length check's practical impact for dense CJK sources: classical Chinese packs far more story into fewer characters, so the 200-character floor stays, but the chapter-count suggestion should treat CJK sources by character count rather than whitespace-separated words, which currently reports a near-zero word count for Chinese pages.

## Technical notes

- `src/lib/story.server.ts`: replace the whitelist regex in `assertReadable` with a junk-ratio test (`/[\p{C}\uFFFD]/gu` over total length, threshold ~5%); keep `text.length < 200` as-is.
- `src/lib/story.server.ts`: in the word-count used by `previewStory`, fall back to character count / 1.7 when the text has a high proportion of Han characters, so the suggested chapter count is sensible for Chinese sources.
- `src/lib/story-schema.test.ts`: add cases for a Chinese passage (accepted) and a binary/garbled blob (still rejected).
