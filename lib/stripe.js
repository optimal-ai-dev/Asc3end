import Stripe from "stripe";

// Server-only — this file must never be imported from anything under src/, since that would
// bundle STRIPE_SECRET_KEY into the browser. Only api/*.js and scripts/*.mjs should import it.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-08-26.dahlia",
});
