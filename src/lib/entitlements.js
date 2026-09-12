// The single place feature-gating policy lives — which features need Asc3end+, and how many
// free-plan monthly uses the metered ones get. Both the client (for UI: show Paywall vs. feature)
// and the server (api/claude.js, the actual enforcement point) import this so the two can never
// drift out of sync the way two independently-maintained copies of "5 free uses" eventually would.
//
// Commercial model (do not describe this as a "trial" anywhere — it isn't one: the Free plan is
// permanent, needs no card, and never expires; these are a standing monthly allowance, not a
// countdown to a required decision):
//   - Free: unlimited workout logging, unlimited manual nutrition logging, progress analytics,
//     5 Coach messages per calendar month, 5 Meals Near You searches per calendar month, no
//     food scanner.
//   - Asc3end+: everything in Free, plus unlimited Coach and unlimited Meals Near You (subject to
//     the same abuse/cost rate limiting every account is under — see lib/rateLimit.js — "unlimited"
//     means no monthly cap, not no limit whatsoever), and the food scanner.
//
// Deliberately framework-free (no supabase client, no React, no Node built-ins) so it works
// unmodified in both a Vite browser bundle and a Vercel serverless function bundle.

import { isEntitled } from "./subscription.js";

export const FEATURES = { SCANNER: "scanner", COACH: "coach", MEALS: "meals", ESTIMATE: "estimate" };

const PREMIUM_ONLY_FEATURES = new Set([FEATURES.SCANNER]);
// "Metered" — free on the Free plan, but capped per calendar month (see lib/monthlyUsage.js for
// the reset mechanism) rather than unlimited or a one-time trial.
const METERED_FEATURES = new Set([FEATURES.COACH, FEATURES.MEALS]);
export const FREE_MONTHLY_LIMIT = 5;

// `usage` is the { coach, meals } counts for the CURRENT calendar month, already loaded from the
// `feature_usage_monthly` table (client: via /api/usage; server: via lib/monthlyUsage.js) — a
// feature not in either set (e.g. "estimate") is always allowed, since it's free and unlimited
// for everyone regardless of plan.
export function canAccessFeature(subscriptionState, feature, usage = {}) {
  if (isEntitled(subscriptionState)) return true;
  if (PREMIUM_ONLY_FEATURES.has(feature)) return false;
  if (METERED_FEATURES.has(feature)) return (usage[feature] || 0) < FREE_MONTHLY_LIMIT;
  return true;
}

export function isMeteredFeature(feature) {
  return METERED_FEATURES.has(feature);
}

export function remainingMonthlyUses(feature, usage = {}) {
  if (!METERED_FEATURES.has(feature)) return null;
  return Math.max(0, FREE_MONTHLY_LIMIT - (usage[feature] || 0));
}
