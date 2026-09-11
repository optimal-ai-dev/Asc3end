// Vercel serverless function. Deployed at /api/stripe-webhook — Stripe calls this whenever a
// subscription is created, changes, or is cancelled. This is the ONLY place subscription status
// actually gets written; the frontend never marks itself premium, since that would let anyone
// grant themselves access by editing client-side state.
//
// Needs STRIPE_WEBHOOK_SECRET set — create the endpoint in the Stripe Dashboard (Developers >
// Webhooks) pointing at https://<your-domain>/api/stripe-webhook once deployed, subscribe it to
// customer.subscription.created/updated/deleted and checkout.session.completed, then copy the
// signing secret it gives you into this env var.

import { stripe } from "../lib/stripe.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

// Signature verification needs the raw request body, so Vercel's default JSON body parsing
// must be disabled for this route.
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function upsertFromSubscription(subscription) {
  const userId = subscription.metadata?.supabase_user_id;
  if (!userId) return; // not one of ours (or created outside the checkout flow) — nothing to sync
  const periodEndUnix = subscription.current_period_end || subscription.items?.data?.[0]?.current_period_end || null;
  const { error } = await supabaseAdmin.from("subscriptions").upsert({
    user_id: userId,
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("subscriptions upsert failed", error);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await upsertFromSubscription(event.data.object);
        break;
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await upsertFromSubscription(subscription);
        }
        break;
      }
      default:
        break; // ignore events we don't care about
    }
    res.status(200).json({ received: true });
  } catch (e) {
    console.error("Stripe webhook handler error", e);
    res.status(500).json({ error: "Webhook handler failed" });
  }
}
