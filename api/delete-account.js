// Vercel serverless function. Deployed at /api/delete-account — the only way an account can
// actually be removed, since deleting an auth user requires the service_role key, which never
// exists client-side. Cleans up the user's own rows first (no FK cascade is configured on these
// tables), then deletes the auth user itself. An active Stripe subscription is cancelled first:
// deleting only our subscriptions row would leave Stripe billing someone who no longer has an
// account to use or to cancel from.

import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { stripe } from "../lib/stripe.js";
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

  const rl = await checkRateLimit(user.id, "delete-account", { windowSeconds: 60, maxRequests: 3 });
  if (!rl.allowed) {
    return res.status(429).json({ error: "Too many requests — please wait a moment and try again." });
  }

  // Statuses where Stripe will never charge again, so there's nothing to cancel.
  const ENDED = ["canceled", "incomplete_expired"];
  try {
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_subscription_id, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (sub?.stripe_subscription_id && !ENDED.includes(sub.status)) {
      try {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      } catch (e) {
        // Already gone on Stripe's side is fine; anything else stops the deletion, so the user can
        // retry instead of losing their account while still being billed.
        if (e?.code !== "resource_missing") {
          console.error("delete-account: stripe cancel failed", { userId: user.id, code: e?.code });
          return res.status(502).json({ error: "Couldn't cancel your subscription, so your account wasn't deleted. Try again, or cancel from Manage Billing first." });
        }
      }
    }

    // Every one of these tables' user_id references auth.users with no ON DELETE clause (default:
    // NO ACTION) — deleteUser() below fails with a foreign-key violation if any row for this user
    // is left behind anywhere. feature_usage_monthly was missing from this list entirely (added
    // after feature_usage_monthly replaced the old feature_usage table for quota tracking — this
    // list was never updated to match), meaning account deletion would have started failing with
    // a raw FK-violation error for the first real user who'd ever used a metered Free-tier feature
    // and then tried to delete their account. feature_usage itself is kept here too since the old
    // table isn't guaranteed to be empty/dropped yet on every environment.
    await supabaseAdmin.from("user_data").delete().eq("user_id", user.id);
    await supabaseAdmin.from("subscriptions").delete().eq("user_id", user.id);
    await supabaseAdmin.from("feature_usage").delete().eq("user_id", user.id);
    await supabaseAdmin.from("feature_usage_monthly").delete().eq("user_id", user.id);
    await supabaseAdmin.from("analytics_events").delete().eq("user_id", user.id);
    await supabaseAdmin.from("feedback").delete().eq("user_id", user.id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("delete-account error", e);
    res.status(500).json({ error: "Could not delete your account — try again, or contact support if this keeps happening." });
  }
}
