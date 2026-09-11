// One-time setup script: creates the Asc3end Premium product + $9.99/month price in your
// Stripe account (test mode, if STRIPE_SECRET_KEY is a sk_test_ key) and prints the price ID
// to paste into STRIPE_PRICE_ID in .env.local / Vercel env vars.
//
// Usage: node scripts/setup-stripe.mjs
// Requires STRIPE_SECRET_KEY to be set in the environment (or in .env.local, loaded below).

import Stripe from "stripe";
import { readFileSync } from "fs";

function loadEnvLocal() {
  try {
    const text = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local not found — fine if STRIPE_SECRET_KEY is already in the environment.
  }
}

loadEnvLocal();

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY is not set (checked process.env and .env.local). Aborting.");
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-08-26.dahlia" });

const product = await stripe.products.create({
  name: "Asc3end Premium",
  description: "Unlocks the AI Coach, food scanner, and Meals Near You.",
});

const price = await stripe.prices.create({
  product: product.id,
  unit_amount: 999, // $9.99
  currency: "usd",
  recurring: { interval: "month" },
});

console.log("Created product:", product.id);
console.log("Created price:  ", price.id);
console.log("\nAdd this to .env.local and to your Vercel project's environment variables:");
console.log(`STRIPE_PRICE_ID=${price.id}`);
