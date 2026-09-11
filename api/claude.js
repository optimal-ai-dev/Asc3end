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

const PREMIUM_ONLY_FEATURES = new Set(["scanner"]);
const TRIAL_FEATURES = new Set(["coach", "meals"]);
export const FREE_TRIAL_LIMIT = 5;

async function isPremiumUser(userId) {
  const { data: sub } = await supabaseAdmin.from("subscriptions").select("status").eq("user_id", userId).maybeSingle();
  return !!(sub && (sub.status === "active" || sub.status === "trialing"));
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

  const { feature, ...body } = req.body || {};

  let premiumChecked = false;
  let premium = false;

  if (PREMIUM_ONLY_FEATURES.has(feature)) {
    premium = await isPremiumUser(user.id);
    premiumChecked = true;
    if (!premium) {
      return res.status(402).json({ error: { message: "This feature requires Asc3end Premium.", code: "premium_required" } });
    }
  }

  let usageCountBeforeThisCall = null; // set only when this call should increment usage after success
  if (TRIAL_FEATURES.has(feature)) {
    if (!premiumChecked) premium = await isPremiumUser(user.id);
    if (!premium) {
      const { data: usage } = await supabaseAdmin
        .from("feature_usage")
        .select("count")
        .eq("user_id", user.id)
        .eq("feature", feature)
        .maybeSingle();
      const current = usage?.count || 0;
      if (current >= FREE_TRIAL_LIMIT) {
        return res.status(402).json({
          error: {
            message: `You've used all ${FREE_TRIAL_LIMIT} free ${feature === "coach" ? "coach conversations" : "meal searches"} — upgrade to keep going.`,
            code: "premium_required",
          },
        });
      }
      usageCountBeforeThisCall = current;
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
