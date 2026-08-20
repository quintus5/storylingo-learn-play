import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Authoring is an operator tool, not a feature of the children's app.
 *
 * Every server function that writes a book, spends AI credits or deletes
 * artwork carries this middleware. Hiding the buttons is not a control — the
 * functions are reachable by anyone who can call the origin — so the check
 * lives on the server and fails closed when no token is configured.
 *
 * The token is a shared secret, which is the right size of lock for a
 * single-operator catalogue. It is not a user account system: when the app
 * grows real accounts this should become a role check instead.
 */
const HEADER = "x-storylingo-admin";

/** Where the operator's token is kept in the browser, for the authoring UI. */
const TOKEN_KEY = "storylingo.adminToken";

export function readAdminToken(): string {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveAdminToken(token: string) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token.trim());
  } catch {
    /* storage unavailable */
  }
}

/** Constant-time compare, so a wrong token cannot be guessed a byte at a time. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const requireAdmin = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const token = readAdminToken();
    return next({ headers: token ? { [HEADER]: token } : {} });
  })
  .server(async ({ next }) => {
    const expected = process.env.ADMIN_TOKEN;
    // No token configured means authoring is off, not that everything is open.
    if (!expected) {
      throw new Error("Authoring is disabled on this deployment.");
    }
    const sent = getRequest()?.headers.get(HEADER) ?? "";
    if (!safeEqual(sent, expected)) {
      throw new Error("That operator token was not accepted.");
    }
    return next();
  });
