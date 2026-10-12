// Server-side subscription lookup shared by the API routes that gate features.

import { supabaseAdmin } from "./supabaseAdmin.js";
import { computeSubscriptionState } from "../src/lib/subscription.js";

// Selects the newer cancel_at_period_end/plan columns with a fallback to the original 3-column
// shape if they don't exist yet on this database (matches the same defensive read App.jsx's
// refreshSubscription does) — without this, a database that hasn't had the Phase 4/5 migration
// applied yet would make the wider select error out, `sub` come back null, and every demo/paid
// user would suddenly read as "free" and lose Coach/Meals access entirely.
export async function getSubscriptionState(userId) {
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
