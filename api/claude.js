// Vercel serverless function. Deployed at /api/claude — this is what the frontend calls instead
// of hitting api.anthropic.com directly. The real API key lives ONLY here, as a server
// environment variable (set it in your Vercel project settings, never in frontend code).
//
// This is the actual fix for "AI features stop working after the daily limit" — that error
// was coming from the shared claude.ai account's personal usage window. A real Anthropic API
// key from https://console.anthropic.com has its own separate billing and much higher limits,
// scaled to what you're willing to pay for as the app owner.
//
// Every call must be authenticated (a signed-in Supabase user) — this closes a previous gap
// where anyone could call this for free. The Stripe paywall is enforced HERE, not just by
// hiding buttons in the UI, which a direct API call would bypass entirely:
//   - "scanner" (the food scanner) always requires an active Asc3end+ subscription.
//   - "coach" and "meals" (Meals Near You) are free on the Free plan up to FREE_MONTHLY_LIMITS
//     uses PER CALENDAR MONTH (see lib/monthlyUsage.js) — this is a standing monthly
//     allowance, not a trial: the Free plan itself never expires and never requires a card.
//   - Asc3end+ gets coach, meals and the scanner up to the PLUS_MONTHLY_LIMITS fair-use caps.
//   - "estimate" (manual food entry's macro estimate) is unlimited and free for everyone.

import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { getMonthlyUsage, incrementMonthlyUsage } from "../lib/monthlyUsage.js";
import { computeSubscriptionState, isEntitled, OWNER_SUBSCRIPTION_STATE } from "../src/lib/subscription.js";
import { isAdminUser } from "../lib/adminAccess.js";
import { canAccessFeature, isMeteredFeature, isUsageTracked, freeMonthlyLimit, plusMonthlyLimit, FEATURES } from "../src/lib/entitlements.js";
import { buildAnthropicRequest } from "../lib/anthropicRequest.js";

// Vercel's Hobby plan defaults serverless functions to a 10-second execution limit — nowhere
// near enough for web-search-augmented Claude calls (Meals Near You), which can legitimately
// take 10-20+ seconds. Without this, Vercel kills the function mid-request regardless of the
// frontend's own timeout, and the client sees a generic failure that looks like "the app is slow".
export const config = { maxDuration: 60 };

// Selects the newer cancel_at_period_end/plan columns with a fallback to the original 3-column
// shape if they don't exist yet on this database (matches the same defensive read App.jsx's
// refreshSubscription does) — without this, a database that hasn't had the Phase 4/5 migration
// applied yet would make the wider select error out, `sub` come back null, and every demo/paid
// user would suddenly read as "free" and lose Coach/Meals access entirely.
async function getSubscriptionState(userId) {
  let { data: sub, error } = await supabaseAdmin
    .from("subscriptions")
    .select("status, stripe_customer_id, current_period_end, cancel_at_period_end, plan")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    ({ data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("status, stripe_customer_id, current_period_end")
      .eq("user_id", userId)
      .maybeSingle());
  }
  return computeSubscriptionState(sub || null);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: { message: "Sign in required." } });
  }
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: { message: "Sign in required." } });
  }

  // Blanket per-user abuse/cost guard, independent of the free-vs-plus business logic below —
  // every call to this endpoint costs real Anthropic API spend regardless of which feature it's
  // for, so it's rate-limited as one bucket rather than per-feature.
  const rl = await checkRateLimit(user.id, "claude", { windowSeconds: 60, maxRequests: 20 });
  if (!rl.allowed) {
    return res.status(429).json({ error: { message: "Too many requests — please wait a moment and try again." } });
  }

  const { feature, ...body } = req.body || {};

  // A pathologically large request body is either a bug or an abuse attempt — reject it before
  // it reaches Anthropic (and gets billed). The client already downscales scanner photos to
  // ~1024px/JPEG-0.8 before sending (see App.jsx's downscaleToBase64), so this is defense in
  // depth against a client that skips that step, not the primary size control.
  const bodySize = JSON.stringify(req.body || {}).length;
  if (bodySize > 1_500_000) {
    return res.status(413).json({ error: { message: "Request too large." } });
  }

  const { request: anthropicRequest, error: validationError } = buildAnthropicRequest(body, feature);
  if (validationError) {
    return res.status(400).json({ error: { message: validationError } });
  }

  const meteredFeature = isMeteredFeature(feature);
  let usageCountBeforeThisCall = null; // set only when this call should increment usage after success

  if (feature === FEATURES.SCANNER || meteredFeature) {
    // Owners (ADMIN_EMAILS) get Asc3end+ with no monthly caps and no Stripe subscription. The
    // per-minute rate limit above still applies to them.
    const subscriptionState = isAdminUser(user) ? OWNER_SUBSCRIPTION_STATE : await getSubscriptionState(user.id);
    const entitled = isEntitled(subscriptionState);
    const tracked = isUsageTracked(subscriptionState, feature);
    let currentUsage = 0;
    let usageKnown = tracked;
    if (tracked) {
      try {
        currentUsage = await getMonthlyUsage(user.id, feature);
      } catch (e) {
        // Fail CLOSED, not open: if usage can't be read, a non-entitled caller must not get an
        // unmetered request — the alternative (defaulting to 0/unlimited) is exactly the bug this
        // replaced, where a missing/unreachable feature_usage_monthly table silently gave every
        // Free user unlimited Coach/Meals access.
        if (!entitled) {
          return res.status(503).json({ error: { message: "Couldn't verify your usage right now — please try again in a moment." } });
        }
        // A paying user's fair-use cap is only abuse protection, so a usage-table outage shouldn't
        // lock them out. Serve the request, but don't write a count based on a value we never read
        // (that would reset their month back to 1).
        usageKnown = false;
      }
    }
    if (!canAccessFeature(subscriptionState, feature, { [feature]: currentUsage })) {
      const noun = { coach: "coach messages", meals: "meal searches", scanner: "food scans", label: "label reads" }[feature];
      if (entitled) {
        // Fair-use cap reached. Not a paywall (they already pay), so no premium_required code.
        return res.status(429).json({ error: { message: `You've reached this month's fair-use limit of ${plusMonthlyLimit(feature)} ${noun}. It resets on the 1st — contact support if you need more.`, code: "monthly_limit_reached" } });
      }
      const message = feature === FEATURES.SCANNER
        ? "The food scanner is an Asc3end+ feature."
        : `You've used all ${freeMonthlyLimit(feature)} free ${noun} this month — upgrade to Asc3end+ for more, or check back next month.`;
      return res.status(402).json({ error: { message, code: "premium_required" } });
    }
    if (usageKnown) {
      usageCountBeforeThisCall = currentUsage;
    }
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicRequest),
    });
    const data = await response.json();
    // Token counts only (no content, no user id) — the raw numbers for checking real per-feature
    // cost and that prompt caching is hitting (cache_read_input_tokens > 0 on later coach turns).
    if (data?.usage) {
      const u = data.usage;
      console.log("claude usage", { feature, input: u.input_tokens, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0, output: u.output_tokens });
    }
    // Only spend a monthly free use on an actual successful call — a network hiccup or
    // Anthropic error shouldn't cost the user one of their monthly uses. A failure
    // to RECORD the increment must not cost the user their already-generated (and already
    // Anthropic-billed) answer — unlike a failed usage READ, this can't be exploited into
    // unlimited access, since the next request's own read will reflect whatever's actually
    // persisted, so it's safe to log and move on rather than fail the whole request.
    if (response.ok && usageCountBeforeThisCall !== null) {
      try {
        await incrementMonthlyUsage(user.id, feature, usageCountBeforeThisCall);
      } catch (e) {
        console.error("failed to record usage increment, serving response anyway", { feature, userId: user.id });
      }
    }
    res.status(response.status).json(data);
  } catch (e) {
    // Structured, PII-free failure log: which feature, which user id (not email), no request/
    // response body (which could contain the athlete's logged food/workout text or, for the
    // scanner, image data) — enough to debug an outage without logging anything sensitive.
    console.error("claude proxy failed", { feature, userId: user.id });
    res.status(500).json({ error: { message: "The AI service didn't respond — please try again." } });
  }
}
