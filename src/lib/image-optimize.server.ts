/**
 * Shrink a freshly generated illustration before it is stored.
 *
 * The image model returns ~2 MB images, far heavier than a phone needs. We
 * decode, resize and re-encode to WebP with WASM codecs so this works in the
 * edge runtime as well as in dev. Every failure path that keeps the original
 * bytes checks first that the bytes really are what they claim to be — the
 * serving route at /api/public/art/$ only accepts a .png or .webp extension,
 * so silently labelling the wrong format as one of those has shipped a file
 * that misrenders before, and would again the moment an image model's output
 * format changes underneath this.
 */

export type OptimizedImage = {
  bytes: Uint8Array;
  contentType: string;
  extension: "webp" | "png" | "jpg";
};

type ImageFormat = "png" | "webp" | "jpeg" | "unknown";

function detectFormat(bytes: Uint8Array): ImageFormat {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "webp";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  return "unknown";
}

/** Keep the original bytes, labelled honestly, when conversion is impossible. */
function passthrough(bytes: Uint8Array, format: ImageFormat): OptimizedImage {
  if (format === "jpeg") return { bytes, contentType: "image/jpeg", extension: "jpg" };
  if (format === "webp") return { bytes, contentType: "image/webp", extension: "webp" };
  return { bytes, contentType: "image/png", extension: "png" };
}
/**
 * In local development the codecs run on Node, where they try to `fetch` their
 * own .wasm file off disk — which Node refuses, so compression silently fell
 * back to storing the raw multi-megabyte original. Load those files straight
 * from disk instead. In the deployed edge runtime the codecs load themselves,
 * so every step here is best-effort and failures are ignored.
 */


const primed = new Map<string, Promise<void>>();

async function primeCodecs(format: ImageFormat): Promise<void> {
  const existing = primed.get(format);
  if (existing) return existing;

  const run = (async () => {
    let readFile: ((p: string) => Promise<Uint8Array>) | null = null;
    try {
      const fs = await import("node:fs/promises");
      readFile = (p) => fs.readFile(p) as unknown as Promise<Uint8Array>;
    } catch {
      return; // no filesystem: the runtime loads the codecs itself
    }

    const bases = [`${process.cwd()}/node_modules/`, "/dev-server/node_modules/"];
    const compile = async (relative: string) => {
      let lastErr: unknown;
      for (const base of bases) {
        try {
          const bytes = await readFile!(`${base}${relative}`);
          return await WebAssembly.compile(bytes as unknown as BufferSource);
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    };
    const step = async (name: string, run: () => Promise<unknown>) => {
      try {
        await run();
      } catch (err) {
        console.warn(`Image codec ${name} could not be preloaded`, err);
      }
    };

    await step("decoder", async () => {
      const dec = (await (format === "png"
        ? import("@jsquash/png/decode")
        : import("@jsquash/jpeg/decode"))) as { init?: (m: unknown) => Promise<unknown> };
      return dec.init?.(
        await compile(
          format === "png"
            ? "@jsquash/png/codec/pkg/squoosh_png_bg.wasm"
            : "@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm",
        ),
      );
    });
    await step("resize", async () => {
      const rs = (await import("@jsquash/resize")) as unknown as {
        initResize?: (m: unknown) => unknown;
      };
      return rs.initResize?.(
        await compile("@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm"),
      );
    });
    await step("webp encoder", async () => {
      const enc = (await import("@jsquash/webp/encode")) as {
        init?: (m: unknown) => Promise<unknown>;
      };
      return enc.init?.(await compile("@jsquash/webp/codec/enc/webp_enc_simd.wasm"));
    });
  })();

  primed.set(format, run);
  return run;
}




/** Resize so the longest edge is at most `maxEdge`, then encode to WebP. */
export async function toWebp(
  source: Uint8Array,
  maxEdge: number,
  quality: number,
): Promise<OptimizedImage> {
  const format = detectFormat(source);

  if (format === "webp") {
    // Already the one format this pipeline stores unconverted.
    return { bytes: source, contentType: "image/webp", extension: "webp" };
  }

  if (format !== "png" && format !== "jpeg") {
    throw new Error(
      `Illustration came back as ${format} — the pipeline only decodes PNG, JPEG or WebP.`,
    );
  }

  try {
    const [decoder, resizeMod, webpMod] = await Promise.all([
      format === "png" ? import("@jsquash/png") : import("@jsquash/jpeg"),
      import("@jsquash/resize"),
      import("@jsquash/webp"),
    ]);
    const { default: resize } = resizeMod;
    const { encode } = webpMod;

    await primeCodecs(format);


    const buffer = source.buffer.slice(
      source.byteOffset,
      source.byteOffset + source.byteLength,
    ) as ArrayBuffer;
    const decoded = await decoder.decode(buffer);
    const scale = maxEdge / Math.max(decoded.width, decoded.height);
    const sized =
      scale < 1
        ? await resize(decoded, {
            width: Math.round(decoded.width * scale),
            height: Math.round(decoded.height * scale),
          })
        : decoded;
    const webp = await encode(sized, { quality });
    const bytes = new Uint8Array(webp);
    if (!bytes.byteLength) throw new Error("empty WebP output");
    console.log(
      `Illustration compressed: ${Math.round(source.byteLength / 1024)}KB ${format} -> ` +
        `${Math.round(bytes.byteLength / 1024)}KB WebP (max edge ${maxEdge}, q${quality})`,
    );
    return { bytes, contentType: "image/webp", extension: "webp" };
  } catch (err) {
    console.warn(`WebP conversion unavailable, storing the original ${format}`, err);
    return passthrough(source, format);
  }
}


/**
 * Read an image's pixel dimensions straight from its header, without a full
 * decode. Used to check the image model really returned the widescreen shape
 * the reader is built for, instead of trusting the request.
 */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = detectFormat(bytes);
  try {
    if (format === "png") {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (format === "jpeg") {
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = bytes[i + 1]!;
        // Start-of-frame markers carry the size; skip the other segments.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
        }
        i += 2 + view.getUint16(i + 2);
      }
      return null;
    }
    if (format === "webp") {
      const chunk = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
      if (chunk === "VP8X") {
        const w = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
        const h = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
        return { width: w, height: h };
      }
      if (chunk === "VP8 ") {
        return {
          width: view.getUint16(26, true) & 0x3fff,
          height: view.getUint16(28, true) & 0x3fff,
        };
      }
      if (chunk === "VP8L") {
        const b = view.getUint32(21, true);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
    }
  } catch {
    return null;
  }
  return null;
}
