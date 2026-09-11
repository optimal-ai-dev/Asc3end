import { describe, it, expect } from "vitest";
import { computeTargets } from "./nutritionMath";

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
