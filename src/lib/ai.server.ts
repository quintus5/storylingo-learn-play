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

/** Generate a single illustration and return the raw PNG bytes. */
export async function generateIllustration(prompt: string): Promise<Uint8Array> {
  const res = await fetch(`${GATEWAY}/images/generations`, {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Image generation failed [${res.status}]: ${body.slice(0, 300)}`);
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
