// One-time setup script: creates the Asc3end+ product with BOTH monthly and annual prices
// (replacing the single-price setup from scripts/setup-stripe.mjs) in your Stripe account (test
// mode, if STRIPE_SECRET_KEY is a sk_test_ key) and prints both price IDs to add to your env.
//
// Pricing matches the product's public pricing page: A$9.99/month, A$79.99/year (~33% off the
// monthly rate over a year).
//
// Usage: node scripts/setup-stripe-pricing.mjs
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
if (!process.env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
  console.error("Refusing to run against a non-test-mode secret key. This script is for test-mode setup only.");
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-08-26.dahlia" });

const product = await stripe.products.create({
  name: "Asc3end+",
  description: "Unlimited AI Coach, food scanner, Meals Near You, and advanced strength analytics.",
});

const monthly = await stripe.prices.create({
  product: product.id,
  unit_amount: 999, // A$9.99
  currency: "aud",
  recurring: { interval: "month" },
  nickname: "Asc3end+ Monthly",
});

const annual = await stripe.prices.create({
  product: product.id,
  unit_amount: 7999, // A$79.99
  currency: "aud",
  recurring: { interval: "year" },
  nickname: "Asc3end+ Annual",
});

console.log("Created product:", product.id);
console.log("Created monthly price:", monthly.id, "(A$9.99/month)");
console.log("Created annual price: ", annual.id, "(A$79.99/year)");
console.log("\nAdd these to .env.local and to your Vercel project's environment variables:");
console.log(`STRIPE_MONTHLY_PRICE_ID=${monthly.id}`);
console.log(`STRIPE_ANNUAL_PRICE_ID=${annual.id}`);
console.log("\n(STRIPE_PRICE_ID from the original single-price setup can stay set — it's used as");
console.log("a monthly fallback for existing customers on the old price — or removed once nothing");
console.log("references it anymore.)");
