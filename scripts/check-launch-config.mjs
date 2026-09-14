#!/usr/bin/env node
// Launch-configuration validator (Phase 19). Checks that required environment variables are SET
// — never prints a value, never logs anything that could leak a secret. Run it before deploying
// to production: `node scripts/check-launch-config.mjs`. Exits non-zero only if a CRITICAL var is
// missing; RECOMMENDED gaps are warnings (the app runs, but isn't launch-ready) and OPTIONAL gaps
// are informational only.
//
// This script is also wired into `npm run build` (see package.json) as a genuine production
// build/configuration gate: it hard-fails the BUILD (distinct from this script's own exit code
// when run standalone) when Vercel's own VERCEL_ENV reports "production" AND either (a) any
// CRITICAL var is missing, or (b) VITE_SUPPORT_EMAIL specifically is unset. A local
// `npm run build`, a Vercel preview deploy, or this script run manually are never affected by
// that gate, only an actual production deploy is.
//
// The CRITICAL check exists because of a real gap: this script's own standalone mode always
// treated a missing CRITICAL var as fatal, but for a long time the --build-gate mode wired into
// the actual deploy pipeline only checked VITE_SUPPORT_EMAIL — meaning a production deploy with,
// say, VITE_SUPABASE_URL unset would build and ship successfully, then show every visitor a
// permanently blank white screen (createClient() throws synchronously at module-load time, before
// React or any error handler exists to catch it — see src/lib/supabase.js and the startup
// hardening in src/main.jsx). The "critical" list should mean something in the pipeline that
// actually gates deploys, not just when someone remembers to run this manually.

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
  // VITE_-prefixed, not the bare LEGAL_BUSINESS_* names from earlier — this is a 100%
  // client-side app with no server rendering, so a non-VITE_-prefixed var is invisible to the
  // browser bundle no matter what value it holds. (Found and fixed after the bare names were set
  // in Vercel and had zero effect — src/lib/legal.js never had a code path to read them.)
  ["VITE_LEGAL_BUSINESS_NAME", "Legal pages don't name a responsible entity without it — see LAUNCH_READINESS.md"],
  ["VITE_LEGAL_BUSINESS_ABN", "Same — business registration details for legal pages"],
  ["VITE_LEGAL_BUSINESS_ADDRESS", "Same — registered address for legal pages"],
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
  // Build-chained mode: for a real Vercel production deploy, a missing CRITICAL var or a missing
  // VITE_SUPPORT_EMAIL both fail the build outright — every other gap here is informational so
  // this never blocks local development or preview deploys over unrelated missing vars.
  if (isProductionBuild && criticalMissing > 0) {
    console.log(`✗ FAIL: ${criticalMissing} CRITICAL var(s) missing for this production deploy.`);
    console.log("  See the CRITICAL list above for which ones and why — the app would deploy");
    console.log("  successfully but fail at runtime (in the worst case, a permanently blank");
    console.log("  screen for every visitor). Set them in the Vercel project's Production");
    console.log("  environment variables, then redeploy.");
    process.exit(1);
  }
  if (isProductionBuild && supportEmailMissing) {
    console.log("✗ FAIL: VITE_SUPPORT_EMAIL is not set for this production deploy.");
    console.log("  The Support and Contact pages would tell every real customer \"not yet");
    console.log("  configured by the app owner.\" Set VITE_SUPPORT_EMAIL in the Vercel project's");
    console.log("  Production environment variables, then redeploy.");
    process.exit(1);
  }
  console.log(isProductionBuild
    ? "✓ Production build gate: all CRITICAL vars and VITE_SUPPORT_EMAIL are set."
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
