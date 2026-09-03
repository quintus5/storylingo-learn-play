const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function key(): string {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("Missing LOVABLE_API_KEY");
  return k;
}

/** Turn a gateway HTTP failure into a message a child's grown-up can act on. */
function gatewayMessage(status: number, body: string, what: string): string {
  if (status === 402) {
    return "The AI credits for this app have run out. Top up credits in your Lovable workspace settings, then try again.";
  }
  if (status === 429) {
    return "The story machine is busy right now. Please wait a moment and try again.";
  }
  return `${what} failed [${status}]: ${body.slice(0, 300)}`;
}

/** Ask a chat model for a strict JSON object and parse it. */
export async function chatJson<T>(
  systemPrompt: string,
  userPrompt: string,
  model = "google/gemini-3.6-flash",
): Promise<T> {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    // Without a deadline a hung gateway call blocks until the platform cuts it.
    signal: AbortSignal.timeout(90_000),
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(gatewayMessage(res.status, body, "AI request"));
  }


  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  return parseJsonLoose<T>(content);
}

export function parseJsonLoose<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error("AI returned malformed JSON");
  }
}

// Illustrations are billed by ByteDance's Seedream model directly, called
// through BytePlus ModelArk, rather than through the Lovable AI gateway used
// above for text. Confirmed working end to end against a real key; see the
// size comment below for the one real correction that testing surfaced —
// check the BytePlus usage dashboard for the actual per-image cost rather
// than trust a resolution-tier price quoted from elsewhere, since this model
// only operates at 2K and up and third-party price pages do not always say
// which tier their headline number is for.
//
// Model ids on Ark are dated and do change (e.g. a Seedream 5 Lite release
// looks like "seedream-5-0-lite-<date>"), and the console is the source of
// truth for the current one — so it is read from an env var rather than
// hardcoded, and generation fails loudly with a clear message if it is
// missing rather than silently calling the wrong model.
const SEEDREAM_ENDPOINT =
  process.env.SEEDREAM_ENDPOINT ?? "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations";

function seedreamKey(): string {
  const k = process.env.SEEDREAM_API_KEY;
  if (!k) throw new Error("Missing SEEDREAM_API_KEY");
  return k;
}

function seedreamModel(): string {
  const m = process.env.SEEDREAM_MODEL;
  if (!m) throw new Error("Missing SEEDREAM_MODEL — set it to the exact model id shown in the BytePlus console.");
  return m;
}

/** Friendly wording for the failures worth explaining; everything else keeps the raw body. */
function seedreamMessage(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return `Image generation was rejected [${status}]. Check that SEEDREAM_API_KEY is correct and that this model is enabled for the account: ${body.slice(0, 300)}`;
  }
  if (status === 429) {
    return "The story machine is busy right now. Please wait a moment and try again.";
  }
  return `Image generation failed [${status}]: ${body.slice(0, 300)}`;
}

/** Generate a single illustration and return the raw PNG bytes. */
export async function generateIllustration(prompt: string): Promise<Uint8Array> {
  const res = await fetch(SEEDREAM_ENDPOINT, {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: {
      Authorization: `Bearer ${seedreamKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: seedreamModel(),
      prompt,
      // Confirmed against the real API, not assumed: this model rejects
      // anything under 3,686,400 pixels (roughly the 2K class). "2K" alone
      // leaves the aspect ratio to the model, which often picks portrait;
      // the reader is landscape-first, so pin an explicit 16:9 size that
      // sits exactly on the 2K floor (2560x1440 = 3,686,400 px). The book
      // only ever stores a 1280px-max WebP anyway (see
      // image-optimize.server.ts), so the extra pixels are downsized away.
      size: process.env.SEEDREAM_SIZE ?? "2560x1440",
      response_format: "b64_json",
      // Seedream can stamp a small visible watermark by default; explicit
      // off, since one showing up in a children's book is a real defect.
      watermark: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(seedreamMessage(res.status, body));
  }

  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image generation returned no image");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export { artStylePrompt as ART_STYLE_PROMPT } from "./art-styles";
