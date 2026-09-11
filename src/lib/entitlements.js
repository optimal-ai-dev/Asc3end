// The single place feature-gating policy lives — which features need Asc3end+, which get a free
// trial, and how many free uses that trial is. Both the client (for UI: show Paywall vs. feature)
// and the server (api/claude.js, the actual enforcement point) import this so the two can never
// drift out of sync the way two independently-maintained copies of "5 free uses" eventually would.
//
// Deliberately framework-free (no supabase client, no React, no Node built-ins) so it works
// unmodified in both a Vite browser bundle and a Vercel serverless function bundle.

import { isEntitled } from "./subscription.js";

export const FEATURES = { SCANNER: "scanner", COACH: "coach", MEALS: "meals", ESTIMATE: "estimate" };

const PREMIUM_ONLY_FEATURES = new Set([FEATURES.SCANNER]);
const TRIAL_FEATURES = new Set([FEATURES.COACH, FEATURES.MEALS]);
export const FREE_TRIAL_LIMIT = 5;

// `usage` is the { coach, meals } counts already loaded from the `feature_usage` table (client:
// via /api/usage; server: via a direct query) — a feature not in either set (e.g. "estimate") is
// always allowed, since it's free and unlimited for everyone.
export function canAccessFeature(subscriptionState, feature, usage = {}) {
  if (isEntitled(subscriptionState)) return true;
  if (PREMIUM_ONLY_FEATURES.has(feature)) return false;
  if (TRIAL_FEATURES.has(feature)) return (usage[feature] || 0) < FREE_TRIAL_LIMIT;
  return true;
}

export function remainingTrialUses(feature, usage = {}) {
  if (!TRIAL_FEATURES.has(feature)) return null;
  return Math.max(0, FREE_TRIAL_LIMIT - (usage[feature] || 0));
}
