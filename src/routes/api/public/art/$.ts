import { createFileRoute } from "@tanstack/react-router";

const IMMUTABLE = "public, max-age=31536000, immutable";
const REDIRECT_CACHE = "public, max-age=3600";
const SIGNED_TTL = 60 * 60 * 24 * 7; // 7 days
const REFRESH_BEFORE = 60 * 60 * 1000; // regenerate when < 1h left

const MAX_CACHED = 500;

const signedUrls = new Map<string, { url: string; expiresAt: number }>();

function cacheSignedUrl(path: string, url: string, expiresAt: number) {
  signedUrls.delete(path);
  signedUrls.set(path, { url, expiresAt });
  while (signedUrls.size > MAX_CACHED) {
    const oldest = signedUrls.keys().next().value;
    if (oldest === undefined) break;
    signedUrls.delete(oldest);
  }
}

/**
 * The stored art is already a compressed WebP (see image-optimize.server.ts)
 * but still sized for a full-screen reader, larger than a bookshelf thumbnail
 * needs. Ask storage for a resized, re-compressed copy instead; if this
 * project has no image transformation, fall back to the raw object.
 */
const TRANSFORM = { width: 1080, quality: 68 } as const;

export const Route = createFileRoute("/api/public/art/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const path = (params as { _splat?: string })._splat ?? "";
        // Only "<bookUuid>/<name>.png|.webp|.jpg" is servable — no traversal, no listing.
        if (!/^[0-9a-f-]{36}\/[a-z0-9-]{1,64}\.(png|webp|jpe?g)$/i.test(path)) {
          return new Response("Not found", { status: 404 });
        }

        const lower = path.toLowerCase();
        const type = lower.endsWith(".webp")
          ? "image/webp"
          : lower.endsWith(".png")
            ? "image/png"
            : "image/jpeg";

        const etag = `"art-${path.replace(/[^a-z0-9]/gi, "-")}"`;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Fast path: redirect to a cached signed CDN URL.
        try {
          const cached = signedUrls.get(path);
          let url = cached && cached.expiresAt - Date.now() > REFRESH_BEFORE ? cached.url : null;
          if (!url) {
            const bucket = supabaseAdmin.storage.from("story-art");
            let signed = await bucket.createSignedUrl(path, SIGNED_TTL, {
              transform: TRANSFORM,
            });
            if (signed.error || !signed.data?.signedUrl) {
              signed = await bucket.createSignedUrl(path, SIGNED_TTL);
            }
            const { data, error } = signed;
            if (!error && data?.signedUrl) {
              url = data.signedUrl;
              cacheSignedUrl(path, url, Date.now() + SIGNED_TTL * 1000);
            }
          }
          if (url) {
            // Short-lived: the signed URL expires, so the redirect must not be immutable.
            return new Response(null, {
              status: 302,
              headers: { Location: url, "Cache-Control": REDIRECT_CACHE },
            });
          }
        } catch {
          // fall through to download-and-serve
        }

        if (request.headers.get("if-none-match") === etag) {
          return new Response(null, {
            status: 304,
            headers: { ETag: etag, "Cache-Control": IMMUTABLE },
          });
        }


        const { data, error } = await supabaseAdmin.storage.from("story-art").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });

        return new Response(data.stream(), {
          headers: {
            "Content-Type": type,
            "Cache-Control": IMMUTABLE,
            ETag: etag,
          },
        });
      },
    },
  },
});
