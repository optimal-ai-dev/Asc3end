// Vercel serverless function. Deployed at /api/claude — this is what the frontend calls instead
// of hitting api.anthropic.com directly. The real API key lives ONLY here, as a server
// environment variable (set it in your Vercel project settings, never in frontend code).
//
// This is the actual fix for "AI features stop working after the daily limit" — that error
// was coming from the shared claude.ai account's personal usage window. A real Anthropic API
// key from https://console.anthropic.com has its own separate billing and much higher limits,
// scaled to what you're willing to pay for as the app owner.
//
// Every call must be authenticated (a signed-in Supabase user) — this closes the previous
// TODO ("anyone can call this for free"). Calls tagged with a premium `feature` additionally
// require an active/trialing row in the `subscriptions` table, which is how the Stripe paywall
// is actually enforced — hiding buttons in the UI alone would not stop a direct API call.

import { supabaseAdmin } from "../lib/supabaseAdmin.js";

const PREMIUM_FEATURES = new Set(["coach", "scanner", "meals"]);

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

  if (PREMIUM_FEATURES.has(feature)) {
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();
    const isPremium = sub && (sub.status === "active" || sub.status === "trialing");
    if (!isPremium) {
      return res.status(402).json({ error: { message: "This feature requires Asc3end Premium.", code: "premium_required" } });
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
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: "Proxy request failed" } });
  }
}
