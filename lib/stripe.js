import Stripe from "stripe";
import dns from "dns";

// Server-only — this file must never be imported from anything under src/, since that would
// bundle STRIPE_SECRET_KEY into the browser. Only api/*.js and scripts/*.mjs should import it.
//
// Node's fetch (undici) can prefer IPv6 by default; on Vercel's serverless runtime the IPv6
// route to api.stripe.com can be broken, so connections hang and eventually fail with
// "An error occurred with our connection to Stripe" after retries. Forcing IPv4-first DNS
// resolution is the standard fix for this class of error.
dns.setDefaultResultOrder("ipv4first");

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-08-26.dahlia",
  httpClient: Stripe.createFetchHttpClient(),
  timeout: 20000,
});
