// Vercel serverless function. Deployed at /api/create-checkout-session — starts a Stripe
// Checkout session for the Asc3end Premium subscription and hands the frontend a URL to
// redirect the user to. Stripe hosts the actual payment page, so no card data ever touches
// this app's frontend or backend.

import { stripe } from "../lib/stripe.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { computeSubscriptionState } from "../src/lib/subscription.js";
import { validateStripeKeyFormat, assertValidOrLog } from "../lib/validateSecretFormat.js";

const PRICE_ID_PATTERN = /^price_[A-Za-z0-9]+$/;
assertValidOrLog("STRIPE_MONTHLY_PRICE_ID", validateStripeKeyFormat(process.env.STRIPE_MONTHLY_PRICE_ID, PRICE_ID_PATTERN, "Stripe price id (price_...)"));
assertValidOrLog("STRIPE_ANNUAL_PRICE_ID", validateStripeKeyFormat(process.env.STRIPE_ANNUAL_PRICE_ID, PRICE_ID_PATTERN, "Stripe price id (price_...)"));

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
      .select("stripe_customer_id, status, current_period_end, cancel_at_period_end, plan")
      .eq("user_id", user.id)
      .maybeSingle();

    // A demo/comp grant (no stripe_customer_id, status active/trialing — see
    // computeSubscriptionState) already has full Asc3end+ access; a real checkout would layer an
    // actual paid subscription on top of a manually-granted one, which is never the intended
    // flow. The client never shows an Upgrade button to a demo account in the first place
    // (isPremium is already true), so reaching this is only possible via a direct API call —
    // still refused here, since client-side hiding is not the actual enforcement boundary.
    if (computeSubscriptionState(existing || null).type === "demo") {
      return res.status(400).json({ error: "This is a demo Asc3end+ account and can't start a paid checkout." });
    }

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
    // Reject anything that isn't exactly one of the two real plans instead of silently falling
    // back to monthly — a typo'd or malformed client request should fail loudly, not quietly
    // check the caller out on a plan they didn't ask for.
    if (plan !== "monthly" && plan !== "annual") {
      return res.status(400).json({ error: "Invalid plan — must be \"monthly\" or \"annual\"." });
    }
    const priceId = priceIdForPlan(plan);
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
    // Structured, PII/secret-free failure log — never the raw exception object, which for a
    // Stripe SDK error can include verbose internal request details we don't need to retain.
    console.error("create-checkout-session error", { userId: user.id, code: e?.code || e?.type, message: e?.message });
    res.status(500).json({ error: "Could not start checkout." });
  }
}
