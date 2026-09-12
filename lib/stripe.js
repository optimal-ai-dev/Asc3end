import Stripe from "stripe";
import { validateSecretFormat, assertValidOrLog } from "./validateSecretFormat.js";

// Server-only — this file must never be imported from anything under src/, since that would
// bundle STRIPE_SECRET_KEY into the browser. Only api/*.js and scripts/*.mjs should import it.

// A real production incident: 24 recorded StripeConnectionError: "Invalid character in header
// content" failures from api/create-checkout-session, some referencing Unicode 8226 (•) — Node's
// http client rejects any Authorization header containing a control character or certain
// non-ASCII bytes, and Stripe's SDK builds that header directly from this key. Checked once at
// module load (this file is only ever imported server-side, once per cold start) so a malformed
// key logs a clear, value-free diagnostic immediately instead of surfacing as a cryptic
// low-level connection error on the first real checkout attempt.
assertValidOrLog("STRIPE_SECRET_KEY", validateSecretFormat(process.env.STRIPE_SECRET_KEY));

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-08-26.dahlia",
});
