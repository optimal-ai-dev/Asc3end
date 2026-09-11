import { describe, it, expect } from "vitest";
import { canAccessFeature, remainingTrialUses, FEATURES, FREE_TRIAL_LIMIT } from "./entitlements";

const FREE = { type: "free", status: "inactive" };
const DEMO = { type: "demo", status: "active" };
const PAID_ACTIVE = { type: "paid", status: "active", plan: "monthly", currentPeriodEnd: null };
const PAST_DUE = { type: "paid", status: "past_due", plan: "monthly", currentPeriodEnd: null };

describe("canAccessFeature", () => {
  it("scanner is premium-only — free user is blocked regardless of usage", () => {
    expect(canAccessFeature(FREE, FEATURES.SCANNER, {})).toBe(false);
  });

  it("scanner is allowed for demo, paid, and grace-period (past_due) states", () => {
    expect(canAccessFeature(DEMO, FEATURES.SCANNER)).toBe(true);
    expect(canAccessFeature(PAID_ACTIVE, FEATURES.SCANNER)).toBe(true);
    expect(canAccessFeature(PAST_DUE, FEATURES.SCANNER)).toBe(true);
  });

  it("coach/meals are free up to FREE_TRIAL_LIMIT uses for a free user", () => {
    expect(canAccessFeature(FREE, FEATURES.COACH, { coach: FREE_TRIAL_LIMIT - 1 })).toBe(true);
    expect(canAccessFeature(FREE, FEATURES.COACH, { coach: FREE_TRIAL_LIMIT })).toBe(false);
    expect(canAccessFeature(FREE, FEATURES.MEALS, { meals: 0 })).toBe(true);
  });

  it("entitled users bypass the trial-count check entirely", () => {
    expect(canAccessFeature(PAID_ACTIVE, FEATURES.COACH, { coach: 999 })).toBe(true);
  });

  it("unrecognized/unlimited features (e.g. manual macro estimate) are always allowed", () => {
    expect(canAccessFeature(FREE, FEATURES.ESTIMATE)).toBe(true);
    expect(canAccessFeature(FREE, "not_a_real_feature")).toBe(true);
  });

  it("missing usage defaults to 0 uses so far", () => {
    expect(canAccessFeature(FREE, FEATURES.COACH)).toBe(true);
  });
});

describe("remainingTrialUses", () => {
  it("counts down from FREE_TRIAL_LIMIT for trial features", () => {
    expect(remainingTrialUses(FEATURES.COACH, { coach: 2 })).toBe(FREE_TRIAL_LIMIT - 2);
  });

  it("never goes negative even if usage overshoots", () => {
    expect(remainingTrialUses(FEATURES.COACH, { coach: FREE_TRIAL_LIMIT + 10 })).toBe(0);
  });

  it("returns null for non-trial features", () => {
    expect(remainingTrialUses(FEATURES.SCANNER, {})).toBeNull();
    expect(remainingTrialUses(FEATURES.ESTIMATE, {})).toBeNull();
  });
});
