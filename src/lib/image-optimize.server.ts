/**
 * Shrink a freshly generated illustration before it is stored.
 *
 * The image model returns ~2 MB PNGs, which are far heavier than a phone
 * needs. We decode, resize and re-encode to WebP with WASM codecs so this
 * works in the edge runtime as well as in dev. Every failure path is
 * non-fatal: the caller keeps the original PNG rather than losing the
 * picture.
 */

export type OptimizedImage = {
  bytes: Uint8Array;
  contentType: string;
  extension: "webp" | "png";
};

/** Resize so the longest edge is at most `maxEdge`, then encode to WebP. */
export async function toWebp(
  png: Uint8Array,
  maxEdge: number,
  quality: number,
): Promise<OptimizedImage> {
  try {
    const [{ decode }, { default: resize }, { encode }] = await Promise.all([
      import("@jsquash/png"),
      import("@jsquash/resize"),
      import("@jsquash/webp"),
    ]);

    const source = png.buffer.slice(
      png.byteOffset,
      png.byteOffset + png.byteLength,
    ) as ArrayBuffer;
    const decoded = await decode(source);
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
      `Illustration compressed: ${Math.round(png.byteLength / 1024)}KB PNG -> ` +
        `${Math.round(bytes.byteLength / 1024)}KB WebP (max edge ${maxEdge}, q${quality})`,
    );
    return { bytes, contentType: "image/webp", extension: "webp" };
  } catch (err) {
    console.warn("WebP conversion unavailable, storing the original PNG", err);
    return { bytes: png, contentType: "image/png", extension: "png" };
  }
}
