// The single place feature-gating policy lives — which features need Asc3end+, and how many
// free-plan monthly uses the metered ones get. Both the client (for UI: show Paywall vs. feature)
// and the server (api/claude.js, the actual enforcement point) import this so the two can never
// drift out of sync the way two independently-maintained copies of "5 free uses" eventually would.
//
// Commercial model (do not describe this as a "trial" anywhere — it isn't one: the Free plan is
// permanent, needs no card, and never expires; these are a standing monthly allowance, not a
// countdown to a required decision):
//   - Free: unlimited workout logging, unlimited manual nutrition logging, progress analytics,
//     5 Coach messages per calendar month, 2 Meals Near You searches per calendar month, no
//     food scanner. Meals gets fewer than Coach because every search includes a web search,
//     the single most expensive AI call the app makes.
//   - Asc3end+: everything in Free, plus Coach, Meals Near You and the food scanner up to a
//     fair-use monthly cap (PLUS_MONTHLY_LIMITS). The caps sit far above normal use — they exist
//     so one heavy or scripted account can't cost more in Claude fees than its subscription
//     pays, which a per-minute rate limit alone (lib/rateLimit.js) doesn't prevent.
//
// Deliberately framework-free (no supabase client, no React, no Node built-ins) so it works
// unmodified in both a Vite browser bundle and a Vercel serverless function bundle.

import { isEntitled } from "./subscription.js";

export const FEATURES = { SCANNER: "scanner", COACH: "coach", MEALS: "meals", ESTIMATE: "estimate", LABEL: "label" };

const PREMIUM_ONLY_FEATURES = new Set([FEATURES.SCANNER]);
// "Metered" — free on the Free plan, but capped per calendar month (see lib/monthlyUsage.js for
// the reset mechanism) rather than unlimited or a one-time trial.
// The nutrition label reader is metered rather than premium-only: it's how someone adds a
// product the food databases don't have, which is exactly the moment a paywall would make
// people give up on logging. One read is a single small vision call, so 20 a month is cheap.
const METERED_FEATURES = new Set([FEATURES.COACH, FEATURES.MEALS, FEATURES.LABEL]);
export const FREE_MONTHLY_LIMITS = { [FEATURES.COACH]: 5, [FEATURES.MEALS]: 2, [FEATURES.LABEL]: 20 };
// Asc3end+ fair-use caps, per calendar month. Roughly 10 coach messages, 1 meal search and 10
// scans a day — a typical subscriber is estimated at ~60 / 8 / 40 a month.
export const PLUS_MONTHLY_LIMITS = { [FEATURES.COACH]: 300, [FEATURES.MEALS]: 30, [FEATURES.SCANNER]: 300, [FEATURES.LABEL]: 300 };

export function freeMonthlyLimit(feature) {
  return FREE_MONTHLY_LIMITS[feature] ?? null;
}

export function plusMonthlyLimit(feature) {
  return PLUS_MONTHLY_LIMITS[feature] ?? null;
}

// `usage` is the per-feature counts for the CURRENT calendar month, already loaded from the
// `feature_usage_monthly` table (client: via /api/usage; server: via lib/monthlyUsage.js) — a
// feature with no limit for the caller's plan (e.g. "estimate") is always allowed, since it's
// free and unlimited for everyone regardless of plan.
export function canAccessFeature(subscriptionState, feature, usage = {}) {
  // The owner's account pays the Claude bill directly, so no fair-use cap applies.
  if (subscriptionState.type === "owner") return true;
  if (isEntitled(subscriptionState)) {
    const cap = plusMonthlyLimit(feature);
    return cap === null || (usage[feature] || 0) < cap;
  }
  if (PREMIUM_ONLY_FEATURES.has(feature)) return false;
  if (METERED_FEATURES.has(feature)) return (usage[feature] || 0) < freeMonthlyLimit(feature);
  return true;
}

// Whether a call to `feature` by this caller counts against a monthly allowance, i.e. whether
// api/claude.js needs to read and increment its feature_usage_monthly row.
export function isUsageTracked(subscriptionState, feature) {
  if (subscriptionState.type === "owner") return false;
  if (isEntitled(subscriptionState)) return plusMonthlyLimit(feature) !== null;
  return METERED_FEATURES.has(feature);
}

export function isMeteredFeature(feature) {
  return METERED_FEATURES.has(feature);
}

// Free-plan allowance left this month (the number the UI counts down from).
export function remainingMonthlyUses(feature, usage = {}) {
  if (!METERED_FEATURES.has(feature)) return null;
  return Math.max(0, freeMonthlyLimit(feature) - (usage[feature] || 0));
}
