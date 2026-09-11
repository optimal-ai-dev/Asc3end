import { describe, it, expect } from "vitest";
import { computeSubscriptionState, isEntitled, describeSubscriptionState } from "./subscription";

describe("computeSubscriptionState", () => {
  it("undefined subscription -> loading", () => {
    expect(computeSubscriptionState(undefined)).toEqual({ type: "loading" });
  });

  it("null subscription (no row) -> free", () => {
    expect(computeSubscriptionState(null)).toEqual({ type: "free", status: "inactive" });
  });

  it("active status with no stripe_customer_id -> demo (manually granted entitlement)", () => {
    expect(computeSubscriptionState({ status: "active", stripe_customer_id: null })).toEqual({ type: "demo", status: "active" });
  });

  it("trialing status with no stripe_customer_id -> demo too", () => {
    expect(computeSubscriptionState({ status: "trialing", stripe_customer_id: null })).toEqual({ type: "demo", status: "active" });
  });

  it("active status WITH a stripe_customer_id -> paid/active, never demo", () => {
    const state = computeSubscriptionState({ status: "active", stripe_customer_id: "cus_123", plan: "monthly", current_period_end: "2026-10-01T00:00:00Z" });
    expect(state).toEqual({ type: "paid", status: "active", plan: "monthly", currentPeriodEnd: "2026-10-01T00:00:00Z" });
  });

  it("active + cancel_at_period_end -> paid/cancelled, but still type 'paid' (access continues until period end)", () => {
    const state = computeSubscriptionState({ status: "active", stripe_customer_id: "cus_123", cancel_at_period_end: true, plan: "annual", current_period_end: "2026-12-01T00:00:00Z" });
    expect(state.type).toBe("paid");
    expect(state.status).toBe("cancelled");
    expect(isEntitled(state)).toBe(true); // still entitled — the whole point of this state
  });

  it("past_due -> paid/past_due, still entitled (grace period, not instant cutoff)", () => {
    const state = computeSubscriptionState({ status: "past_due", stripe_customer_id: "cus_123", plan: "monthly" });
    expect(state).toEqual({ type: "paid", status: "past_due", plan: "monthly", currentPeriodEnd: null });
    expect(isEntitled(state)).toBe(true);
  });

  it("canceled (subscription actually ended) -> free, not entitled", () => {
    const state = computeSubscriptionState({ status: "canceled", stripe_customer_id: "cus_123" });
    expect(state).toEqual({ type: "free", status: "inactive" });
    expect(isEntitled(state)).toBe(false);
  });

  it("unrecognized/incomplete Stripe statuses conservatively map to free, never accidentally granting access", () => {
    for (const status of ["incomplete", "incomplete_expired", "unpaid", "paused", "some_future_stripe_status"]) {
      const state = computeSubscriptionState({ status, stripe_customer_id: "cus_123" });
      expect(state.type).toBe("free");
      expect(isEntitled(state)).toBe(false);
    }
  });
});

describe("isEntitled", () => {
  it("free and loading and error are never entitled", () => {
    expect(isEntitled({ type: "free", status: "inactive" })).toBe(false);
    expect(isEntitled({ type: "loading" })).toBe(false);
    expect(isEntitled({ type: "error", message: "x" })).toBe(false);
  });

  it("demo is always entitled", () => {
    expect(isEntitled({ type: "demo", status: "active" })).toBe(true);
  });

  it("paid is entitled for active/trialing/past_due/cancelled, not for anything else", () => {
    for (const status of ["active", "trialing", "past_due", "cancelled"]) {
      expect(isEntitled({ type: "paid", status, plan: "monthly", currentPeriodEnd: null })).toBe(true);
    }
  });
});

describe("describeSubscriptionState — human-readable status text", () => {
  it("never throws for any valid state shape", () => {
    const states = [
      { type: "loading" },
      { type: "error", message: "oops" },
      { type: "free", status: "inactive" },
      { type: "demo", status: "active" },
      { type: "paid", status: "active", plan: "monthly", currentPeriodEnd: "2026-10-01T00:00:00Z" },
      { type: "paid", status: "trialing", plan: "annual", currentPeriodEnd: null },
      { type: "paid", status: "past_due", plan: null, currentPeriodEnd: null },
      { type: "paid", status: "cancelled", plan: "monthly", currentPeriodEnd: "2026-10-01T00:00:00Z" },
    ];
    for (const s of states) {
      expect(() => describeSubscriptionState(s)).not.toThrow();
      expect(typeof describeSubscriptionState(s)).toBe("string");
    }
  });

  it("demo always shows the exact required copy", () => {
    expect(describeSubscriptionState({ type: "demo", status: "active" })).toBe("Asc3end+ Demo Access");
  });
});
