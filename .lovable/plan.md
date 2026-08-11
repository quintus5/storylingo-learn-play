# Image model: keep as is

Seedream 5.0 Lite is not available through Lovable AI. The supported image models are the Gemini image family (`google/gemini-3.1-flash-image`, `google/gemini-3-pro-image`, `google/gemini-3.1-flash-lite-image`) and OpenAI's `openai/gpt-image-2` / `openai/gpt-image-1-mini`.

## Decision

Stay on `google/gemini-3.1-flash-image` for book illustrations. It is the best balance of speed, cost, and quality for generating 8–10 chapter books plus a cover, and the Story Bible consistency prompts are already tuned for it.

## Changes

None. No code edits are required.

## If you want Seedream later

It would need a third-party provider (Replicate or fal) and your own API key stored as a project secret, plus a new server-side image call path alongside the current gateway call in `src/lib/ai.server.ts`. Say the word and I will plan that out.
