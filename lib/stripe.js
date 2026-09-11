import Stripe from "stripe";

// Server-only — this file must never be imported from anything under src/, since that would
// bundle STRIPE_SECRET_KEY into the browser. Only api/*.js and scripts/*.mjs should import it.
//
// Explicitly using the fetch-based HTTP client instead of Stripe's default Node `https` agent —
// on Vercel's serverless runtime the default agent intermittently fails with "An error occurred
// with our connection to Stripe" (a known issue in sandboxed/serverless network stacks); fetch
// doesn't have that problem.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-08-26.dahlia",
  httpClient: Stripe.createFetchHttpClient(),
});
