#!/usr/bin/env node
// Launch-configuration validator (Phase 19). Checks that required environment variables are SET
// — never prints a value, never logs anything that could leak a secret. Run it before deploying
// to production: `node scripts/check-launch-config.mjs`. Exits non-zero only if a CRITICAL var is
// missing; RECOMMENDED gaps are warnings (the app runs, but isn't launch-ready) and OPTIONAL gaps
// are informational only.
//
// This script is also wired into `npm run build` (see package.json) as a genuine production
// build/configuration gate for one specific thing: VITE_SUPPORT_EMAIL. It only hard-fails the
// BUILD (distinct from this script's own exit code when run standalone) when Vercel's own
// VERCEL_ENV reports "production" AND the support email is unset — a local `npm run build`, a
// Vercel preview deploy, or this script run manually are never affected by that gate, only an
// actual production deploy is. A support page silently telling every real customer "not yet
// configured by the app owner" is exactly the kind of unfinished-looking gap that should block a
// production deploy loudly instead of shipping quietly.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envLocalPath = path.join(__dirname, "..", ".env.local");

// Loads .env.local into process.env for a local run, without overwriting anything already set
// (so `vercel env pull` / real Vercel env vars always win when this runs as part of a build).
function loadEnvLocal() {
  if (!fs.existsSync(envLocalPath)) return;
  const lines = fs.readFileSync(envLocalPath, "utf8").split("\n");
  for (const line of lines) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvLocal();

const CRITICAL = [
  ["VITE_SUPABASE_URL", "Supabase project URL — nothing works without it"],
  ["VITE_SUPABASE_ANON_KEY", "Supabase anon key — client can't authenticate without it"],
  ["SUPABASE_SERVICE_ROLE_KEY", "Server-side Supabase access — webhooks, admin metrics, account deletion all need it"],
  ["ANTHROPIC_API_KEY", "AI Coach, food scanner, and Meals Near You all call this"],
  ["STRIPE_SECRET_KEY", "Checkout, billing portal, and webhook verification all need it"],
  ["VITE_STRIPE_PUBLISHABLE_KEY", "Referenced by the client billing flow"],
  ["STRIPE_WEBHOOK_SECRET", "Without this, subscription status can never be written — payments would succeed in Stripe but never activate Asc3end+"],
  ["STRIPE_MONTHLY_PRICE_ID", "Checkout falls back to STRIPE_PRICE_ID if unset, but that's a pre-Phase-5 single-price setup"],
  ["STRIPE_ANNUAL_PRICE_ID", "Annual plan on the Pricing page has nothing to check out with if unset"],
  ["APP_URL", "Checkout success/cancel redirect URLs are wrong without it (falls back to request headers, which is less reliable behind a proxy)"],
];

const RECOMMENDED = [
  ["VITE_SUPPORT_EMAIL", "Support/Contact pages currently say \"not yet configured by the app owner\" without it"],
  ["LEGAL_BUSINESS_NAME", "Legal pages don't name a responsible entity without it — see LAUNCH_READINESS.md"],
  ["LEGAL_BUSINESS_ABN", "Same — business registration details for legal pages"],
  ["LEGAL_BUSINESS_ADDRESS", "Same — registered address for legal pages"],
  ["ADMIN_EMAILS", "/api/admin-metrics refuses everyone (403) without at least one allowlisted email"],
];

const OPTIONAL = [
  ["VITE_SENTRY_DSN", "No remote error reporting without it — app still works, errors only go to the browser console"],
  ["VITE_POSTHOG_KEY", "Optional analytics beyond the built-in Supabase-based analytics_events"],
  ["VITE_POSTHOG_HOST", "Pairs with VITE_POSTHOG_KEY"],
];

function checkGroup(title, vars) {
  console.log(`\n${title}`);
  let missing = 0;
  for (const [key, why] of vars) {
    const isSet = !!(process.env[key] && process.env[key].length > 0);
    console.log(`  ${isSet ? "✓" : "✗"} ${key}${isSet ? "" : `  — ${why}`}`);
    if (!isSet) missing++;
  }
  return missing;
}

const buildGateMode = process.argv.includes("--build-gate");

console.log("Asc3end launch-configuration check");
console.log("(presence only — no values are ever printed)");

const criticalMissing = checkGroup("CRITICAL (app is broken without these):", CRITICAL);
const recommendedMissing = checkGroup("RECOMMENDED before a real launch:", RECOMMENDED);
const optionalMissing = checkGroup("OPTIONAL:", OPTIONAL);

const isProductionBuild = process.env.VERCEL_ENV === "production";
const supportEmailMissing = !(process.env.VITE_SUPPORT_EMAIL && process.env.VITE_SUPPORT_EMAIL.length > 0);

console.log("\n---");

if (buildGateMode) {
  // Narrow, build-chained mode: the ONLY thing that can fail the actual `vite build` step is a
  // production deploy missing the support email — every other gap here is informational so this
  // never blocks local development or preview deploys over unrelated missing vars.
  if (isProductionBuild && supportEmailMissing) {
    console.log("✗ FAIL: VITE_SUPPORT_EMAIL is not set for this production deploy.");
    console.log("  The Support and Contact pages would tell every real customer \"not yet");
    console.log("  configured by the app owner.\" Set VITE_SUPPORT_EMAIL in the Vercel project's");
    console.log("  Production environment variables, then redeploy.");
    process.exit(1);
  }
  console.log(isProductionBuild
    ? "✓ Production build gate: VITE_SUPPORT_EMAIL is set."
    : "✓ Build gate skipped (not a Vercel production build).");
  process.exit(0);
}

if (criticalMissing > 0) {
  console.log(`✗ ${criticalMissing} CRITICAL var(s) missing — do not deploy to production yet.`);
  process.exit(1);
} else if (recommendedMissing > 0) {
  console.log(`⚠ All CRITICAL vars set, but ${recommendedMissing} RECOMMENDED var(s) missing — the app runs, but review LAUNCH_READINESS.md before calling this launch-ready.`);
  process.exit(0);
} else {
  console.log(`✓ All CRITICAL and RECOMMENDED vars are set. (${optionalMissing} optional var(s) unset — fine to skip.)`);
  process.exit(0);
}
