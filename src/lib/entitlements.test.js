import { describe, it, expect } from "vitest";
import { canAccessFeature, remainingMonthlyUses, isMeteredFeature, FEATURES, FREE_MONTHLY_LIMIT } from "./entitlements";

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

  it("coach/meals are free up to FREE_MONTHLY_LIMIT uses for a free user", () => {
    expect(canAccessFeature(FREE, FEATURES.COACH, { coach: FREE_MONTHLY_LIMIT - 1 })).toBe(true);
    expect(canAccessFeature(FREE, FEATURES.COACH, { coach: FREE_MONTHLY_LIMIT })).toBe(false);
    expect(canAccessFeature(FREE, FEATURES.MEALS, { meals: 0 })).toBe(true);
  });

  it("entitled users bypass the monthly-count check entirely — Asc3end+ has no monthly cap to enforce", () => {
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

describe("isMeteredFeature", () => {
  it("coach and meals are metered; scanner and unlisted features are not", () => {
    expect(isMeteredFeature(FEATURES.COACH)).toBe(true);
    expect(isMeteredFeature(FEATURES.MEALS)).toBe(true);
    expect(isMeteredFeature(FEATURES.SCANNER)).toBe(false);
    expect(isMeteredFeature(FEATURES.ESTIMATE)).toBe(false);
  });
});

describe("remainingMonthlyUses", () => {
  it("counts down from FREE_MONTHLY_LIMIT for metered features", () => {
    expect(remainingMonthlyUses(FEATURES.COACH, { coach: 2 })).toBe(FREE_MONTHLY_LIMIT - 2);
  });

  it("never goes negative even if usage overshoots", () => {
    expect(remainingMonthlyUses(FEATURES.COACH, { coach: FREE_MONTHLY_LIMIT + 10 })).toBe(0);
  });

  it("returns null for non-metered features", () => {
    expect(remainingMonthlyUses(FEATURES.SCANNER, {})).toBeNull();
    expect(remainingMonthlyUses(FEATURES.ESTIMATE, {})).toBeNull();
  });
});
