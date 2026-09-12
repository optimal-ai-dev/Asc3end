// Detects the exact class of bug behind a real production incident: 24 recorded
// `StripeConnectionError: Invalid character in header content ["Authorization"]` errors from
// api/create-checkout-session, some referencing Unicode 8226 (•). Node's http client rejects any
// header value containing a control character (\n, \r) or certain non-ASCII bytes — Stripe's SDK
// builds the Authorization header directly from STRIPE_SECRET_KEY, so a key pasted into Vercel's
// env var UI with a trailing newline, a smart quote, or a bullet copied from a formatted
// list/document produces exactly this failure on every single API call.
//
// This never logs or returns the value itself — only whether it's clean and, if not, which class
// of problem was found. Safe to call on every request; the check itself is a handful of regex
// tests on a short string, not a meaningful cost.

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/; // excludes \t\n\r, checked separately below
const NEWLINE_OR_CR = /[\r\n]/;
// Common paste artifacts from formatted documents/word processors/bullet lists.
const SMART_PUNCTUATION = /[‘’“”–—• ]/;

/**
 * @param {string|undefined} value
 * @returns {{ ok: true } | { ok: false, problem: string }}
 */
export function validateSecretFormat(value) {
  if (!value) return { ok: false, problem: "not set" };
  if (value !== value.trim()) return { ok: false, problem: "has leading or trailing whitespace" };
  if (NEWLINE_OR_CR.test(value)) return { ok: false, problem: "contains a newline or carriage return character" };
  if (CONTROL_CHARS.test(value)) return { ok: false, problem: "contains a non-printable control character" };
  if (SMART_PUNCTUATION.test(value)) return { ok: false, problem: "contains a smart quote, bullet, em/en-dash, or non-breaking space (likely pasted from a formatted document)" };
  if (/^["']|["']$/.test(value)) return { ok: false, problem: "is wrapped in quote characters that shouldn't be part of the value" };
  return { ok: true };
}

/** @param {string|undefined} value @param {RegExp} prefixPattern @param {string} label */
export function validateStripeKeyFormat(value, prefixPattern, label) {
  const base = validateSecretFormat(value);
  if (!base.ok) return base;
  if (!prefixPattern.test(value)) return { ok: false, problem: `doesn't match the expected ${label} format` };
  return { ok: true };
}

// Logs a clear, value-free diagnostic and returns whether the check passed — call this once at
// the top of any server route that's about to use one of these secrets, so a malformed value
// fails fast with a useful log line instead of surfacing as a cryptic StripeConnectionError deep
// inside the Stripe SDK.
export function assertValidOrLog(name, result) {
  if (!result.ok) {
    console.error(`Configuration problem: ${name} ${result.problem}. Replace it in Vercel's Production environment variables — never paste from a source that could add invisible formatting characters (rich text, some PDF viewers, some chat apps).`);
  }
  return result.ok;
}
