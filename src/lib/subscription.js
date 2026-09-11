// The single authoritative representation of a user's entitlement state. Every place in the app
// that needs to know "can this user access premium features" or "what should the billing section
// say" should go through computeSubscriptionState() + isEntitled(), not read `subscription.status`
// or a raw boolean directly — this is what "one authoritative subscription system" means in
// practice for a codebase that doesn't have a framework enforcing it.
//
// Shape (JSDoc, since this project is plain JS, not TypeScript):
//
// SubscriptionState =
//   | { type: "free", status: "inactive" }
//   | { type: "demo", status: "active" }
//   | { type: "paid", status: "trialing"|"active"|"past_due"|"cancelled", plan: "monthly"|"annual"|null, currentPeriodEnd: string|null }
//   | { type: "loading" }
//   | { type: "error", message: string }
//
// `subscription` here is the row shape App.jsx already loads from the `subscriptions` table:
// { status, stripe_customer_id, current_period_end, cancel_at_period_end, plan } — undefined
// means "not checked yet" (loading), null means "no row" (free), an object is a real row.

export function computeSubscriptionState(subscription) {
  if (subscription === undefined) return { type: "loading" };
  if (subscription === null) return { type: "free", status: "inactive" };

  const { status, stripe_customer_id, current_period_end, cancel_at_period_end, plan } = subscription;

  // Premium with no Stripe customer on file can only happen from a manually-granted (demo/comp)
  // entitlement — a real subscription always gets a stripe_customer_id from the checkout webhook.
  if (!stripe_customer_id && (status === "active" || status === "trialing")) {
    return { type: "demo", status: "active" };
  }

  if (status === "trialing" || status === "active") {
    return {
      type: "paid",
      // cancel_at_period_end=true means Stripe's own status is still "active" (they keep access
      // until the period they already paid for ends) but the UI should say "cancels on X", not
      // "renews on X" — this is exactly the "avoid instantly removing paid access before the
      // period ends" rule expressed as data instead of a special case in every component.
      status: cancel_at_period_end ? "cancelled" : status,
      plan: plan || null,
      currentPeriodEnd: current_period_end || null,
    };
  }

  if (status === "past_due") {
    // Stripe is still retrying the payment (dunning) — treated as a grace period, not an
    // immediate cutoff, matching "avoid instantly removing paid access."
    return { type: "paid", status: "past_due", plan: plan || null, currentPeriodEnd: current_period_end || null };
  }

  // "canceled" here means the subscription has actually ended (Stripe only sets this once the
  // final period is over — see customer.subscription.deleted) — no more access, back to free.
  // Any other/unrecognized Stripe status (incomplete, incomplete_expired, unpaid, paused, or
  // anything not explicitly handled above) is conservatively treated the same way: never grant
  // access for a status this app doesn't explicitly recognize as paid.
  return { type: "free", status: "inactive" };
}

// The one boolean components actually gate premium UI on.
export function isEntitled(state) {
  if (state.type === "demo") return true;
  if (state.type === "paid") return state.status === "active" || state.status === "trialing" || state.status === "past_due" || state.status === "cancelled";
  return false;
}

// Short human-readable status line for billing UI (Dashboard banner, Profile subscription
// section, pricing page). Centralized so the wording can't drift between the places that show it.
export function describeSubscriptionState(state) {
  switch (state.type) {
    case "loading": return "Checking subscription…";
    case "error": return state.message || "Couldn't check subscription status.";
    case "demo": return "Asc3end+ Demo Access";
    case "free": return "Free plan";
    case "paid": {
      const planLabel = state.plan === "annual" ? "Annual" : state.plan === "monthly" ? "Monthly" : "";
      if (state.status === "past_due") return `Payment issue${planLabel ? ` (${planLabel})` : ""} — update your card to keep Asc3end+`;
      if (state.status === "cancelled") return `Asc3end+ ${planLabel} — cancels ${state.currentPeriodEnd ? "on " + new Date(state.currentPeriodEnd).toLocaleDateString() : "at period end"}`;
      if (state.status === "trialing") return `Asc3end+ ${planLabel} trial${state.currentPeriodEnd ? " — ends " + new Date(state.currentPeriodEnd).toLocaleDateString() : ""}`;
      return `Asc3end+ ${planLabel}${state.currentPeriodEnd ? " — renews " + new Date(state.currentPeriodEnd).toLocaleDateString() : ""}`;
    }
    default: return "";
  }
}
