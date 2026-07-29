import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  text: z.string().trim().min(1).max(400),
  slow: z.boolean().optional(),
});

const INSTRUCTIONS =
  "You are reading a Mandarin Chinese children's picture book aloud. Speak the given text exactly, " +
  "warmly and clearly, with correct Mandarin tones. Do not add, translate, explain or repeat anything.";

async function synthesize(text: string, slow: boolean, apiKey: string) {
  return fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input: text,
      voice: "alloy",
      instructions: INSTRUCTIONS,
      speed: slow ? 0.6 : 0.95,
      response_format: "mp3",
      stream_format: "audio",
    }),
  });
}

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request", { status: 400 });
        const { text, slow = false } = parsed.data;

        let res = await synthesize(text, slow, apiKey);
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.error(`TTS failed [${res.status}]: ${body.slice(0, 300)}`);
          return new Response(body || "TTS failed", { status: res.status });
        }

        let bytes = new Uint8Array(await res.arrayBuffer());

        // Sanity-check the clip: a short word must not come back as a long
        // recording (a sign the model spoke more than the requested text).
        const maxBytes = 6000 + text.length * 9000;
        if (bytes.byteLength < 600 || bytes.byteLength > maxBytes) {
          res = await synthesize(text, slow, apiKey);
          if (res.ok) {
            const retry = new Uint8Array(await res.arrayBuffer());
            if (retry.byteLength >= 600) bytes = retry;
          }
        }

        if (bytes.byteLength < 600) return new Response("Empty audio", { status: 502 });

        return new Response(bytes, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
