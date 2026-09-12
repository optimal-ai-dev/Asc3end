// Vercel serverless function. Deployed at /api/create-portal-session — opens Stripe's hosted
// Billing Portal so a subscriber can update payment details or cancel, without this app needing
// to build any of that UI itself.

import { stripe } from "../lib/stripe.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { checkRateLimit } from "../lib/rateLimit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: "Sign in required." });
  }
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: "Sign in required." });
  }

  const rl = await checkRateLimit(user.id, "create-portal-session", { windowSeconds: 60, maxRequests: 10 });
  if (!rl.allowed) {
    return res.status(429).json({ error: "Too many requests — please wait a moment and try again." });
  }

  try {
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return res.status(400).json({ error: "No subscription found for this account." });
    }

    const origin = process.env.APP_URL || req.headers.origin || `https://${req.headers.host}`;
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/`,
    });

    res.status(200).json({ url: portalSession.url });
  } catch (e) {
    console.error("create-portal-session error", { userId: user.id, code: e?.code || e?.type, message: e?.message });
    res.status(500).json({ error: "Could not open billing portal." });
  }
}
