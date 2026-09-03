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
    if (body.includes("SetLimitExceeded") || body.includes("Safe Experience Mode")) {
      return "Image generation is paused by the image provider's account limit. The app owner needs to raise or disable Safe Experience Mode, then use Repaint.";
    }
    return "The story machine is busy right now. Please wait a moment and try again.";
  }
  return `Image generation failed [${status}]: ${body.slice(0, 300)}`;
}

class SeedreamHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null,
    readonly retryable: boolean,
    body: string,
  ) {
    super(seedreamMessage(status, body));
    this.name = "SeedreamHttpError";
  }
}

const RETRYABLE_IMAGE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [2_000, 5_000, 12_000];
const IMAGE_GAP_MS = 750;
let imageQueue: Promise<void> = Promise.resolve();

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The image provider applies one account-wide rate limit. Serialising calls in
 * this module prevents separate chapters and anchor sheets from creating a
 * burst, while keeping a rejected queue item from blocking later work.
 */
function enqueueImage<T>(work: () => Promise<T>): Promise<T> {
  const run = imageQueue.then(work, work);
  imageQueue = run.then(
    async () => wait(IMAGE_GAP_MS),
    async () => wait(IMAGE_GAP_MS),
  );
  return run;
}

/** Widescreen sizes: the second is tried once if the first came back portrait. */
const WIDE_SIZES = ["2560x1440", "2496x1664"];


async function askSeedream(prompt: string, size: string, refs: string[]): Promise<Uint8Array> {
  const res = await fetch(SEEDREAM_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${seedreamKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: seedreamModel(),
      prompt,
      // Reference pictures: the book's anchor sheets for the characters and
      // the place in this scene. This is what actually keeps a face the same
      // from chapter to chapter — words alone get re-interpreted every call.
      ...(refs.length ? { image: refs } : {}),
      // Confirmed against the real API, not assumed: this model rejects
      // anything under 3,686,400 pixels (roughly the 2K class). "2K" alone
      // leaves the aspect ratio to the model, which often picks portrait;
      // the reader is landscape-first, so pin an explicit 16:9 size that
      // sits exactly on the 2K floor (2560x1440 = 3,686,400 px). The book
      // only ever stores a 1280px-max WebP anyway (see
      // image-optimize.server.ts), so the extra pixels are downsized away.
      size,
      response_format: "b64_json",
      // Seedream can stamp a small visible watermark by default; explicit
      // off, since one showing up in a children's book is a real defect.
      watermark: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const retryAfter = res.headers.get("retry-after");
    const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
    throw new SeedreamHttpError(
      res.status,
      Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null,
      RETRYABLE_IMAGE_STATUSES.has(res.status) &&
        !body.includes("SetLimitExceeded") &&
        !body.includes("Safe Experience Mode"),
      body,
    );
  }

  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image generation returned no image");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function askSeedreamWithRetry(
  prompt: string,
  size: string,
  refs: string[],
): Promise<Uint8Array> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await askSeedream(prompt, size, refs);
    } catch (err) {
      const retryable = err instanceof SeedreamHttpError && err.retryable;
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) throw err;
      const fallback = RETRY_DELAYS_MS[attempt] ?? 12_000;
      const delay = Math.max(err.retryAfterMs ?? fallback, fallback) + Math.floor(Math.random() * 500);
      console.warn(
        `Image request returned ${err.status}; retrying in ${Math.round(delay / 1000)}s ` +
          `(attempt ${attempt + 2}/${RETRY_DELAYS_MS.length + 1})`,
      );
      await wait(delay);
    }
  }
}

/**
 * Generate a single illustration and return the raw image bytes.
 *
 * `refs` are reference image URLs (the book's anchor sheets). The result's
 * real dimensions are checked rather than assumed: a portrait picture in a
 * landscape reader is a visible defect, so one widescreen retry is made
 * before accepting whatever came back.
 */
export async function generateIllustration(prompt: string, refs: string[] = []): Promise<Uint8Array> {
  return enqueueImage(async () => {
    const configured = process.env.SEEDREAM_SIZE;
    const sizes = configured ? [configured] : WIDE_SIZES;
    const { imageSize } = await import("./image-optimize.server");

    let last: Uint8Array | null = null;
    for (const size of sizes) {
      const bytes = await askSeedreamWithRetry(prompt, size, refs);
      last = bytes;
      const dims = imageSize(bytes);
      if (!dims) return bytes; // unknown header: accept rather than burn credits
      if (dims.width / dims.height >= 1.3) return bytes;
      console.warn(
        `Illustration came back ${dims.width}x${dims.height} (not widescreen) at size "${size}"` +
          (size === sizes[sizes.length - 1] ? " — keeping it." : " — retrying."),
      );
    }
    if (!last) throw new Error("Image generation returned no image");
    return last;
  });
}


export { artStylePrompt as ART_STYLE_PROMPT } from "./art-styles";
