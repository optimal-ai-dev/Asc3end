// Vercel serverless function. Deployed at /api/stripe-webhook — Stripe calls this whenever a
// subscription is created, changes, or is cancelled. This is the ONLY place subscription status
// actually gets written; the frontend never marks itself premium, since that would let anyone
// grant themselves access by editing client-side state.
//
// Needs STRIPE_WEBHOOK_SECRET set — create the endpoint in the Stripe Dashboard (Developers >
// Webhooks) pointing at https://<your-domain>/api/stripe-webhook once deployed, subscribe it to:
//   customer.subscription.created, customer.subscription.updated, customer.subscription.deleted,
//   customer.subscription.trial_will_end, checkout.session.completed, invoice.paid,
//   invoice.payment_failed
// then copy the signing secret it gives you into this env var.

import { stripe } from "../lib/stripe.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { validateSecretFormat, assertValidOrLog } from "../lib/validateSecretFormat.js";

// Same class of check as lib/stripe.js's STRIPE_SECRET_KEY validation — a malformed webhook
// secret (trailing newline, pasted smart quote) wouldn't produce the exact same connection error,
// but it WOULD make every genuine Stripe webhook fail signature verification, silently breaking
// subscription activation for every real customer. Checked once at module load.
assertValidOrLog("STRIPE_WEBHOOK_SECRET", validateSecretFormat(process.env.STRIPE_WEBHOOK_SECRET));

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

// Maps a Stripe price id to the app's own "monthly"/"annual" label, purely from server-side env
// config — never trusts anything the client sends for this. Both env vars are optional pre-Phase-5
// (a single legacy price is still supported): if neither is set, or the price doesn't match
// either, `plan` is left null and the UI falls back to generic "Asc3end+" copy rather than
// guessing.
function detectPlan(subscription) {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_MONTHLY_PRICE_ID) return "monthly";
  if (priceId === process.env.STRIPE_ANNUAL_PRICE_ID) return "annual";
  if (priceId === process.env.STRIPE_PRICE_ID) return "monthly"; // the original single-price setup
  return null;
}

// The subscription as Stripe has it right now. Falls back to the event payload only when Stripe says
// the object no longer exists; any other failure throws so the webhook answers 5xx and Stripe retries.
async function currentSubscription(fromEvent) {
  try {
    return (await stripe.subscriptions.retrieve(fromEvent.id)) || fromEvent;
  } catch (e) {
    if (e?.code === "resource_missing" || e?.statusCode === 404) return fromEvent;
    throw e;
  }
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
    cancel_at_period_end: !!subscription.cancel_at_period_end,
    plan: detectPlan(subscription),
    updated_at: new Date().toISOString(),
  });
  // Throw so the caller answers 5xx (Stripe retries) instead of acknowledging an event whose result was lost.
  if (error) { console.error("subscriptions upsert failed", { userId, code: error.code, message: error.message }); throw new Error("subscriptions upsert failed"); }
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

  // Idempotency: Stripe can and does deliver the same event more than once (retries on a slow
  // response, network blips, etc.) — record the event id before processing, and if it's already
  // there, this is a redelivery. Insert-with-primary-key-conflict is the check: two concurrent
  // deliveries of the same event can only have one insert succeed.
  const { error: dedupeError } = await supabaseAdmin
    .from("processed_webhook_events")
    .insert({ event_id: event.id, event_type: event.type });
  if (dedupeError) {
    if (dedupeError.code === "23505") { // unique_violation — already processed this event id
      return res.status(200).json({ received: true, duplicate: true });
    }
    console.error("webhook dedupe insert failed", dedupeError.message);
    // Fail open on infra errors here rather than silently dropping a real billing event —
    // worst case a very rare redelivery gets processed twice, which upsertFromSubscription
    // already tolerates (it's a full replace of the row, not an increment).
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        // Stripe does not guarantee delivery order: a delayed "updated" (active) arriving AFTER
        // "deleted" would otherwise re-grant access to a cancelled customer. So the event is only a
        // signal — the current subscription is re-read from Stripe and THAT is what gets stored.
        await upsertFromSubscription(await currentSubscription(event.data.object));
        break;
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await upsertFromSubscription(subscription);
        }
        break;
      }
      // Diagnostic-safe logging only (event id + subscription id, never amounts/card/customer
      // details) — the actual status transition (active <-> past_due) is already driven by
      // customer.subscription.updated, which Stripe fires alongside both of these. Logged
      // separately so a payment-failure pattern is visible in Vercel logs without needing to
      // cross-reference subscription events.
      case "invoice.paid":
        console.log("invoice.paid", { subscription: event.data.object.subscription });
        break;
      case "invoice.payment_failed":
        console.log("invoice.payment_failed", { subscription: event.data.object.subscription });
        break;
      // Refund / dispute policy: a refund or dispute does not by itself change access — access follows
      // the subscription, which the owner cancels (Stripe Dashboard or portal) → customer.subscription.deleted.
      // Logged so a dispute is visible in Vercel logs.
      case "charge.refunded":
      case "charge.dispute.created":
        console.log(event.type, { charge: event.data.object.id });
        break;
      case "customer.subscription.trial_will_end":
        // Hook point for a future "your trial ends in 3 days" notification — no email sending
        // exists in this codebase yet, so this just logs for now rather than silently doing
        // nothing with an event the integration is supposed to handle.
        console.log("customer.subscription.trial_will_end", { subscription: event.data.object.id });
        break;
      default:
        break; // ignore events we don't care about
    }
    res.status(200).json({ received: true });
  } catch (e) {
    console.error("Stripe webhook handler error", { eventId: event.id, type: event.type, message: e?.message });
    // Release the dedupe claim, otherwise Stripe's retry would be treated as a duplicate and the
    // event (e.g. the activation after a paid checkout) would be silently lost forever.
    if (!dedupeError) await supabaseAdmin.from("processed_webhook_events").delete().eq("event_id", event.id);
    res.status(500).json({ error: "Webhook handler failed" });
  }
}
