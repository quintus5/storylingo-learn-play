/**
 * Whether this build carries the operator tools: making books, deleting them,
 * repainting them, and the test unlock switch.
 *
 * Off by default, so the app children install is a reader and nothing else.
 * Set VITE_ENABLE_AUTHORING=1 for a local or staging build to get them back.
 *
 * This only decides what the interface offers. The real boundary is the
 * operator token checked server-side in admin-middleware.ts — a build with the
 * flag on still cannot write anything without it.
 */
export const AUTHORING_ENABLED = import.meta.env.VITE_ENABLE_AUTHORING === "1";
