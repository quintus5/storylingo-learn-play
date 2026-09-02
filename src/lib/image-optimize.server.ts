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
    const [decoder, { default: resize }, { encode }] = await Promise.all([
      format === "png" ? import("@jsquash/png") : import("@jsquash/jpeg"),
      import("@jsquash/resize"),
      import("@jsquash/webp"),
    ]);

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

