# Why the voice keeps saying "having a rest"

Every narration request is being rejected before it ever reaches the voice service. The network log shows the same result for every clip:

```text
POST /api/tts  →  403 Forbidden
Origin: https://db0a28a1-...lovableproject.com
```

## The cause

The narration endpoint has a guard that only allows calls coming from the app itself. It compares the browser's `Origin` header against the origin it reads off the incoming request URL. Inside the hosting runtime that request URL is the internal address, not the public preview address the browser used — so the two never match and the guard rejects 100% of requests, including legitimate ones from the reader. The toast is the app's polite way of reporting that 403.

This affects the preview and any deployment where the public hostname differs from the internal one, which is why no audio plays anywhere.

## The fix

Keep the protection (the endpoint should not become a free public voice proxy) but compare against the hostname the browser actually addressed.

- Build the expected origin from the forwarded host headers (`x-forwarded-host` / `host` plus `x-forwarded-proto`) and fall back to the request URL only if those are absent.
- Accept the request when the `Origin` or `Referer` host matches that host.
- Also accept `Sec-Fetch-Site: same-origin`, which browsers send for genuine first-party fetches.
- Keep rejecting requests with a foreign origin or no origin signal at all.

## Technical notes

- Change is confined to `isSameOrigin()` in `src/routes/api/tts.ts`; no other files change.
- Compare host only (not scheme), since the edge terminates TLS and the internal protocol may differ.
- After the change, verify in the preview that a page read returns `200` with `Content-Type: audio/mpeg`, and that a request with a spoofed foreign `Origin` still returns `403`.
- Cached clips are unaffected; no cache version bump is needed because no audio was ever successfully stored.
