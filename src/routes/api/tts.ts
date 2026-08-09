import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  text: z.string().trim().min(1).max(400),
  slow: z.boolean().optional(),
  voice: z.enum(["wang", "kenshi", "hong", "lee"]).optional(),
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
      speed: slow ? 0.5 : 0.65,
      response_format: "mp3",
      stream_format: "audio",
    }),
  });
}

/** Fish Audio narrator voices (reference ids). */
const FISH_VOICES = {
  wang: "59cb5986671546eaa6ca8ae6f29f6d22",
  kenshi: "5a88883c20a84f378db686ac6b0bba79",
  hong: "5fc69411fe274f149bce4e743534ffa4",
  lee: "626bb6d3f3364c9cbc3aa6a67300a664",
} as const;

type VoiceId = keyof typeof FISH_VOICES;

async function synthesizeFish(text: string, slow: boolean, apiKey: string, voice: VoiceId) {
  const referenceId = FISH_VOICES[voice];

  return fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      model: process.env.FISH_AUDIO_MODEL || "s2.1-pro-free",
    },
    body: JSON.stringify({
      text,
      format: "mp3",
      mp3_bitrate: 128,
      normalize: true,
      latency: "normal",
      ...(referenceId ? { reference_id: referenceId } : {}),
      prosody: { speed: slow ? 0.5 : 0.65, volume: 0 },
    }),
  });
}

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Narration is for this app's own pages, not a public TTS proxy.
 * The public hostname the browser used arrives in the forwarded host headers —
 * `request.url` holds the internal address, so it can't be compared directly.
 */
function isSameOrigin(request: Request): boolean {
  const headers = request.headers;

  // Browsers send this for genuine first-party fetches.
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite === "same-origin") return true;
  if (fetchSite && fetchSite !== "none") return false;

  const forwarded = (headers.get("x-forwarded-host") || headers.get("host") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const expected = forwarded || new URL(request.url).host.toLowerCase();

  const caller = hostOf(headers.get("origin")) ?? hostOf(headers.get("referer"));
  if (!caller) return false;
  return caller === expected;
}


export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });

        const fishKey = process.env.FISH_AUDIO_API_KEY;
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!fishKey && !apiKey) return new Response("Missing TTS credentials", { status: 500 });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request", { status: 400 });
        const { text, slow = false, voice = "wang" } = parsed.data;

        const run = async () =>
          fishKey ? synthesizeFish(text, slow, fishKey, voice) : synthesize(text, slow, apiKey!);

        let provider = fishKey ? "fish" : "openai";
        let res = await run();
        if (!res.ok && fishKey && apiKey) {
          provider = "openai-fallback";
          const body = await res.text().catch(() => "");
          console.error(`Fish Audio TTS failed [${res.status}]: ${body.slice(0, 300)}`);
          res = await synthesize(text, slow, apiKey);
        }
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.error(`TTS failed [${res.status}]: ${body.slice(0, 300)}`);
          return new Response(body || "TTS failed", { status: res.status });
        }

        let bytes = new Uint8Array(await res.arrayBuffer());

        // Only retry on obviously broken audio. A generous ceiling matters:
        // every retry is a second paid synthesis.
        const maxBytes = 60_000 + text.length * 30_000;
        if (bytes.byteLength < 600 || bytes.byteLength > maxBytes) {
          res = await run();

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
            "X-TTS-Provider": provider,
          },
        });
      },
    },
  },
});
