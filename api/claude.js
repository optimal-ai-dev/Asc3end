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
//   - "scanner" (the food scanner) always requires an active subscription.
//   - "coach" and "meals" (Meals Near You) are free for FREE_TRIAL_LIMIT uses each, tracked
//     per-user in the `feature_usage` table, then require a subscription.
//   - "estimate" (manual food entry's macro estimate) is unlimited and free for everyone.

import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { computeSubscriptionState, isEntitled } from "../src/lib/subscription.js";
import { canAccessFeature, FEATURES, FREE_TRIAL_LIMIT } from "../src/lib/entitlements.js";

// Vercel's Hobby plan defaults serverless functions to a 10-second execution limit — nowhere
// near enough for web-search-augmented Claude calls (Meals Near You), which can legitimately
// take 10-20+ seconds. Without this, Vercel kills the function mid-request regardless of the
// frontend's own timeout, and the client sees a generic failure that looks like "the app is slow".
export const config = { maxDuration: 60 };

// This endpoint is reachable directly by anyone with a valid bearer token (not only through the
// app's own frontend — a modified client or a stolen token can call it with an arbitrary body),
// so the request forwarded to Anthropic can't just be trusted as-is. Only ever forward a small,
// validated shape: a fixed model, a capped max_tokens, and (if present) exactly the one tool the
// app actually uses — never an arbitrary model name or tool the caller supplies.
const ALLOWED_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS_CEILING = 4096;
const MAX_MESSAGES = 60; // generous for a long Coach conversation, bounds worst-case cost/latency

function validateAnthropicBody(body) {
  if (!body || typeof body !== "object") return "Invalid request.";
  if (body.model !== ALLOWED_MODEL) return "Invalid model.";
  if (!Number.isInteger(body.max_tokens) || body.max_tokens <= 0 || body.max_tokens > MAX_TOKENS_CEILING) return "Invalid max_tokens.";
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > MAX_MESSAGES) return "Invalid messages.";
  if (body.system !== undefined && typeof body.system !== "string") return "Invalid system prompt.";
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools) || body.tools.length !== 1) return "Invalid tools.";
    const t = body.tools[0];
    if (t?.type !== "web_search_20250305" || t?.name !== "web_search" || t?.max_uses !== 1) return "Invalid tools.";
  }
  return null;
}

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

  // Blanket per-user abuse/cost guard, independent of the free-trial/premium business logic
  // below — every call to this endpoint costs real Anthropic API spend regardless of which
  // feature it's for, so it's rate-limited as one bucket rather than per-feature.
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

  const validationError = validateAnthropicBody(body);
  if (validationError) {
    return res.status(400).json({ error: { message: validationError } });
  }

  const isTrialFeature = feature === FEATURES.COACH || feature === FEATURES.MEALS;
  let usageCountBeforeThisCall = null; // set only when this call should increment usage after success

  if (feature === FEATURES.SCANNER || isTrialFeature) {
    const subscriptionState = await getSubscriptionState(user.id);
    let currentUsage = 0;
    if (isTrialFeature && !isEntitled(subscriptionState)) {
      const { data: usage } = await supabaseAdmin
        .from("feature_usage")
        .select("count")
        .eq("user_id", user.id)
        .eq("feature", feature)
        .maybeSingle();
      currentUsage = usage?.count || 0;
    }
    if (!canAccessFeature(subscriptionState, feature, { [feature]: currentUsage })) {
      const message = feature === FEATURES.SCANNER
        ? "This feature requires Asc3end Premium."
        : `You've used all ${FREE_TRIAL_LIMIT} free ${feature === "coach" ? "coach conversations" : "meal searches"} — upgrade to keep going.`;
      return res.status(402).json({ error: { message, code: "premium_required" } });
    }
    // Only a non-entitled caller of a trial feature spends one of their free uses — an entitled
    // (demo/paid) caller's feature_usage row is never read or incremented, matching the pre-Phase-6
    // behavior of only tracking usage for people the trial actually applies to.
    if (isTrialFeature && !isEntitled(subscriptionState)) {
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
      body: JSON.stringify(body),
    });
    const data = await response.json();
    // Only spend a free-trial use on an actual successful call — a network hiccup or Anthropic
    // error shouldn't cost the user one of their 5 free tries.
    if (response.ok && usageCountBeforeThisCall !== null) {
      await supabaseAdmin.from("feature_usage").upsert({
        user_id: user.id,
        feature,
        count: usageCountBeforeThisCall + 1,
        updated_at: new Date().toISOString(),
      });
    }
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: "Proxy request failed" } });
  }
}
