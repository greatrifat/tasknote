/**
 * A single shared password guarding the whole site.
 *
 * This is not user accounts — there is one person using this. It exists because
 * meeting transcripts were readable by anyone who knew the URL, and because API
 * keys cannot live in the database until something is standing in front of it.
 *
 * The session cookie is an HMAC over its own expiry, so it cannot be forged
 * without APP_SECRET and cannot be replayed once it lapses. Nothing about the
 * password itself is stored in the cookie.
 *
 * Uses Web Crypto rather than node:crypto so the same code runs in middleware,
 * which executes on the Edge runtime.
 */

export const SESSION_COOKIE = "tasknote_session";

/** Thirty days: long enough not to be a nuisance, short enough to lapse. */
const SESSION_DAYS = 30;

function secret() {
  const value = process.env.APP_SECRET;
  if (!value) throw new Error("APP_SECRET is not configured");
  return value;
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

/**
 * Constant-time comparison. A plain === leaks how much of the value matched
 * through timing, which is exactly the signal an attacker forging a cookie
 * would want.
 */
function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isPasswordConfigured() {
  return Boolean(process.env.APP_PASSWORD && process.env.APP_SECRET);
}

export function checkPassword(candidate) {
  const expected = process.env.APP_PASSWORD || "";
  return Boolean(expected) && equal(String(candidate ?? ""), expected);
}

/** Builds a signed cookie value: "<expiry>.<signature>". */
export async function createSession() {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${await hmac(String(expires))}`;
}

export async function isValidSession(value) {
  if (!value) return false;
  const [expires, signature] = String(value).split(".");
  if (!expires || !signature) return false;
  if (!Number(expires) || Number(expires) < Date.now()) return false;
  return equal(signature, await hmac(expires));
}

export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
