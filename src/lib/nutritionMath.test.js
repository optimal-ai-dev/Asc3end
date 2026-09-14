import { describe, it, expect } from "vitest";
import { computeTargets, getNutritionTargets, classifyDayAdherence } from "./nutritionMath";

describe("computeTargets — nutrition recommendations never contain NaN", () => {
  it("computes sane targets for a well-formed profile", () => {
    const t = computeTargets({ weightKg: 75, heightCm: 178, age: 28, gender: "male", goal: "muscle_growth" });
    expect(Number.isFinite(t.calories)).toBe(true);
    expect(Number.isFinite(t.protein)).toBe(true);
    expect(Number.isFinite(t.carbs)).toBe(true);
    expect(Number.isFinite(t.fat)).toBe(true);
    expect(t.calories).toBeGreaterThan(0);
  });

  it("falls back to placeholder body metrics instead of propagating NaN when weight/height/age are missing or invalid", () => {
    const t = computeTargets({ goal: "general" }); // no weightKg/heightCm/age at all
    expect(Number.isNaN(t.calories)).toBe(false);
    expect(Number.isNaN(t.protein)).toBe(false);
    expect(Number.isNaN(t.carbs)).toBe(false);
    expect(Number.isNaN(t.fat)).toBe(false);
  });

  it("handles zero, negative, and non-numeric body metrics the same way", () => {
    for (const bad of [0, -10, NaN, undefined, null, "not a number"]) {
      const t = computeTargets({ weightKg: bad, heightCm: bad, age: bad, goal: "general" });
      expect(Number.isFinite(t.calories)).toBe(true);
      expect(Number.isFinite(t.protein)).toBe(true);
    }
  });

  it("never lets carbs go negative even on an aggressive cut", () => {
    const t = computeTargets({ weightKg: 50, heightCm: 150, age: 60, gender: "female", goal: "fat_loss" });
    expect(t.carbs).toBeGreaterThanOrEqual(0);
  });

  it("a manual macro override always wins over the calculated targets", () => {
    const override = { calories: 2500, protein: 180, carbs: 250, fat: 70 };
    const t = computeTargets({ weightKg: 75, heightCm: 178, age: 28, gender: "male", goal: "fat_loss", macroOverride: override });
    expect(t).toEqual(override);
  });
});

// getNutritionTargets is the single function Home, Food, Profile & Settings, and the Coach system
// prompt all call — these tests exist to prove that guarantee directly: the same profile object
// can never produce two different answers depending on who asks, because there is only one
// function and one code path computing the number.
describe("getNutritionTargets — the one source of truth every screen reads", () => {
  const baseProfile = { weightKg: 75, heightCm: 178, age: 28, gender: "male", goal: "muscle_growth" };

  it("the same profile produces byte-identical targets no matter how many times or where it's called", () => {
    const fromHome = getNutritionTargets(baseProfile);
    const fromFood = getNutritionTargets(baseProfile);
    const fromSettings = getNutritionTargets({ ...baseProfile }); // a fresh object, same values
    expect(fromHome).toEqual(fromFood);
    expect(fromHome).toEqual(fromSettings);
  });

  it("tags calculated targets with source: 'calculated'", () => {
    const t = getNutritionTargets(baseProfile);
    expect(t.source).toBe("calculated");
  });

  it("tags a manual override with source: 'manual', and returns the override values verbatim", () => {
    const override = { calories: 2800, protein: 180, carbs: 300, fat: 80 };
    const t = getNutritionTargets({ ...baseProfile, macroOverride: override });
    expect(t.source).toBe("manual");
    expect(t.calories).toBe(2800);
    expect(t.protein).toBe(180);
    expect(t.carbs).toBe(300);
    expect(t.fat).toBe(80);
  });

  it("regression: switching manual mode off immediately reflects the live calculated value, not a stale cached one", () => {
    // Simulates the exact bug report: a profile that once had a manual override (or an old cached
    // `targets` snapshot from a prior version of this code) with numbers that don't match what the
    // current profile fields would calculate — turning the override off must show the live
    // calculated number, never leftover values from before.
    const staleProfile = { ...baseProfile, targets: { calories: 2800, protein: 180, carbs: 300, fat: 80 } };
    const withOverrideOn = { ...staleProfile, macroOverride: { calories: 2800, protein: 180, carbs: 300, fat: 80 } };
    const withOverrideOff = { ...staleProfile, macroOverride: null };

    expect(getNutritionTargets(withOverrideOn).source).toBe("manual");
    expect(getNutritionTargets(withOverrideOn).calories).toBe(2800);

    const calculated = getNutritionTargets(withOverrideOff);
    expect(calculated.source).toBe("calculated");
    // Must equal a fresh calculation from the live profile fields, NOT the stale `targets` field
    // (which is never read by getNutritionTargets — this assertion would fail if it were).
    expect(calculated).toEqual(getNutritionTargets(baseProfile));
  });

  it("regression: a leftover legacy `profile.targets` field is never read — only macroOverride and live fields matter", () => {
    const profileWithMismatchedLegacyField = {
      ...baseProfile,
      targets: { calories: 1, protein: 1, carbs: 1, fat: 1 }, // obviously stale/wrong if ever read
    };
    const t = getNutritionTargets(profileWithMismatchedLegacyField);
    expect(t.calories).not.toBe(1);
    expect(t).toEqual(getNutritionTargets(baseProfile));
  });

  it("changing a profile field (e.g. weight) is reflected immediately with no separate recalculation step", () => {
    const before = getNutritionTargets(baseProfile);
    const after = getNutritionTargets({ ...baseProfile, weightKg: 95 });
    expect(after.calories).toBeGreaterThan(before.calories);
    expect(after.protein).toBeGreaterThan(before.protein);
  });
});

// classifyDayAdherence is the single rule behind Home's weekly adherence strip, the Monthly
// Report, and the nutrition challenge template — these tests live here (its actual home) rather
// than being duplicated per-consumer.
describe("classifyDayAdherence", () => {
  const targets = { calories: 2000, protein: 150 };

  it("returns 'none' for a day with nothing logged", () => {
    expect(classifyDayAdherence([], targets)).toBe("none");
  });

  it("returns 'good' when calories are in-band and protein meets the floor", () => {
    expect(classifyDayAdherence([{ calories: 2000, protein: 150 }], targets)).toBe("good");
  });

  it("does not count hitting calories on low protein as 'good'", () => {
    expect(classifyDayAdherence([{ calories: 2000, protein: 40 }], targets)).not.toBe("good");
  });

  it("returns 'partial' for a moderate overshoot", () => {
    expect(classifyDayAdherence([{ calories: 2500, protein: 150 }], targets)).toBe("partial");
  });

  it("returns 'off' for a wild overshoot", () => {
    expect(classifyDayAdherence([{ calories: 4000, protein: 150 }], targets)).toBe("off");
  });

  it("sums multiple entries before judging adherence", () => {
    const foods = [{ calories: 1000, protein: 75 }, { calories: 1000, protein: 75 }];
    expect(classifyDayAdherence(foods, targets)).toBe("good");
  });
});
