import { describe, it, expect } from "vitest";
import { canAccessFeature, remainingMonthlyUses, isMeteredFeature, isUsageTracked, FEATURES, FREE_MONTHLY_LIMITS, PLUS_MONTHLY_LIMITS } from "./entitlements";

const FREE_COACH_LIMIT = FREE_MONTHLY_LIMITS.coach;

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

  it("coach/meals are free up to FREE_COACH_LIMIT uses for a free user", () => {
    expect(canAccessFeature(FREE, FEATURES.COACH, { coach: FREE_COACH_LIMIT - 1 })).toBe(true);
    expect(canAccessFeature(FREE, FEATURES.COACH, { coach: FREE_COACH_LIMIT })).toBe(false);
    expect(canAccessFeature(FREE, FEATURES.MEALS, { meals: 0 })).toBe(true);
  });

  it("meals has its own, smaller free allowance than coach", () => {
    expect(FREE_MONTHLY_LIMITS.meals).toBeLessThan(FREE_MONTHLY_LIMITS.coach);
    expect(canAccessFeature(FREE, FEATURES.MEALS, { meals: FREE_MONTHLY_LIMITS.meals - 1 })).toBe(true);
    expect(canAccessFeature(FREE, FEATURES.MEALS, { meals: FREE_MONTHLY_LIMITS.meals })).toBe(false);
  });

  it("entitled users get far more than the free allowance, up to the fair-use cap", () => {
    expect(canAccessFeature(PAID_ACTIVE, FEATURES.COACH, { coach: FREE_COACH_LIMIT + 50 })).toBe(true);
    expect(canAccessFeature(PAID_ACTIVE, FEATURES.COACH, { coach: PLUS_MONTHLY_LIMITS.coach - 1 })).toBe(true);
    expect(canAccessFeature(PAID_ACTIVE, FEATURES.COACH, { coach: PLUS_MONTHLY_LIMITS.coach })).toBe(false);
    expect(canAccessFeature(DEMO, FEATURES.MEALS, { meals: PLUS_MONTHLY_LIMITS.meals })).toBe(false);
    expect(canAccessFeature(PAID_ACTIVE, FEATURES.SCANNER, { scanner: PLUS_MONTHLY_LIMITS.scanner })).toBe(false);
  });

  it("the free macro estimate stays uncapped for entitled users too", () => {
    expect(canAccessFeature(PAID_ACTIVE, FEATURES.ESTIMATE, { estimate: 100000 })).toBe(true);
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

describe("isUsageTracked", () => {
  it("tracks coach/meals for free users and coach/meals/scanner for entitled users", () => {
    expect(isUsageTracked(FREE, FEATURES.COACH)).toBe(true);
    expect(isUsageTracked(FREE, FEATURES.SCANNER)).toBe(false);
    expect(isUsageTracked(PAID_ACTIVE, FEATURES.COACH)).toBe(true);
    expect(isUsageTracked(PAID_ACTIVE, FEATURES.SCANNER)).toBe(true);
    expect(isUsageTracked(PAID_ACTIVE, FEATURES.ESTIMATE)).toBe(false);
    expect(isUsageTracked(FREE, FEATURES.ESTIMATE)).toBe(false);
  });
});

describe("remainingMonthlyUses", () => {
  it("counts down from FREE_COACH_LIMIT for metered features", () => {
    expect(remainingMonthlyUses(FEATURES.COACH, { coach: 2 })).toBe(FREE_COACH_LIMIT - 2);
  });

  it("counts meals down from its own limit", () => {
    expect(remainingMonthlyUses(FEATURES.MEALS, { meals: 1 })).toBe(FREE_MONTHLY_LIMITS.meals - 1);
  });

  it("never goes negative even if usage overshoots", () => {
    expect(remainingMonthlyUses(FEATURES.COACH, { coach: FREE_COACH_LIMIT + 10 })).toBe(0);
  });

  it("returns null for non-metered features", () => {
    expect(remainingMonthlyUses(FEATURES.SCANNER, {})).toBeNull();
    expect(remainingMonthlyUses(FEATURES.ESTIMATE, {})).toBeNull();
  });
});

describe("owner access (ADMIN_EMAILS)", () => {
  const OWNER = { type: "owner", status: "active" };

  it("can use every feature regardless of usage, with no fair-use cap", () => {
    for (const feature of Object.values(FEATURES)) {
      expect(canAccessFeature(OWNER, feature, { [feature]: 1_000_000 })).toBe(true);
    }
  });

  it("isn't usage-tracked, so api/claude.js never reads or writes its monthly counts", () => {
    for (const feature of Object.values(FEATURES)) {
      expect(isUsageTracked(OWNER, feature)).toBe(false);
    }
  });
});
