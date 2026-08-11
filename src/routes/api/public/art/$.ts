import { createFileRoute } from "@tanstack/react-router";

const IMMUTABLE = "public, max-age=31536000, immutable";
const REDIRECT_CACHE = "public, max-age=3600";
const SIGNED_TTL = 60 * 60 * 24 * 7; // 7 days
const REFRESH_BEFORE = 60 * 60 * 1000; // regenerate when < 1h left

const signedUrls = new Map<string, { url: string; expiresAt: number }>();

export const Route = createFileRoute("/api/public/art/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const path = (params as { _splat?: string })._splat ?? "";
        // Only "<bookUuid>/<name>.png" is servable — no traversal, no listing.
        if (!/^[0-9a-f-]{36}\/[a-z0-9-]{1,64}\.png$/i.test(path)) {
          return new Response("Not found", { status: 404 });
        }

        const etag = `"art-${path.replace(/[^a-z0-9]/gi, "-")}"`;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Fast path: redirect to a cached signed CDN URL.
        try {
          const cached = signedUrls.get(path);
          let url = cached && cached.expiresAt - Date.now() > REFRESH_BEFORE ? cached.url : null;
          if (!url) {
            const { data, error } = await supabaseAdmin.storage
              .from("story-art")
              .createSignedUrl(path, SIGNED_TTL);
            if (!error && data?.signedUrl) {
              url = data.signedUrl;
              signedUrls.set(path, { url, expiresAt: Date.now() + SIGNED_TTL * 1000 });
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
            "Content-Type": "image/png",
            "Cache-Control": IMMUTABLE,
            ETag: etag,
          },
        });
      },
    },
  },
});
