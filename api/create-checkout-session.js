// Vercel serverless function. Deployed at /api/create-checkout-session — starts a Stripe
// Checkout session for the Asc3end Premium subscription and hands the frontend a URL to
// redirect the user to. Stripe hosts the actual payment page, so no card data ever touches
// this app's frontend or backend.

import { stripe } from "../lib/stripe.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { checkRateLimit } from "../lib/rateLimit.js";

// Never trust a client-supplied price id directly — only ever select from this fixed mapping of
// server-configured price ids, so a modified client can't check out at an arbitrary price.
function priceIdForPlan(plan) {
  if (plan === "annual" && process.env.STRIPE_ANNUAL_PRICE_ID) return process.env.STRIPE_ANNUAL_PRICE_ID;
  if (plan === "monthly" && process.env.STRIPE_MONTHLY_PRICE_ID) return process.env.STRIPE_MONTHLY_PRICE_ID;
  // Pre-Phase-5-pricing-setup fallback: the original single monthly price.
  return process.env.STRIPE_MONTHLY_PRICE_ID || process.env.STRIPE_PRICE_ID;
}

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

  const rl = await checkRateLimit(user.id, "create-checkout-session", { windowSeconds: 60, maxRequests: 5 });
  if (!rl.allowed) {
    return res.status(429).json({ error: "Too many requests — please wait a moment and try again." });
  }

  try {
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabaseAdmin.from("subscriptions").upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        status: "inactive",
      });
    }

    const { plan, trial } = req.body || {};
    const priceId = priceIdForPlan(plan === "annual" ? "annual" : "monthly");
    if (!priceId) {
      return res.status(500).json({ error: "Billing is not fully configured yet — no price is set for this plan. Contact support." });
    }

    const origin = process.env.APP_URL || req.headers.origin || `https://${req.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { supabase_user_id: user.id },
        // Only offered when the caller explicitly asks for it (the pricing page's trial toggle)
        // — Stripe doesn't natively dedupe "has this customer already trialed before" for
        // Checkout-created subscriptions, so this is an honest "optional" trial, not a
        // guaranteed-once-ever one; fine for a beta launch, worth revisiting before wide launch
        // if trial abuse becomes a real cost concern.
        ...(trial ? { trial_period_days: 7 } : {}),
      },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("create-checkout-session error", e);
    res.status(500).json({ error: "Could not start checkout." });
  }
}
