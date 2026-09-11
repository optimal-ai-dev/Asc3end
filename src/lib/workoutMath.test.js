import { describe, it, expect } from "vitest";
import { suggestNextTarget, evaluatePR, computeGamification, hasValidSets, validSets } from "./workoutMath";

describe("hasValidSets / validSets", () => {
  it("treats an exercise with no sets as having no valid sets", () => {
    expect(hasValidSets({ name: "Lat Pulldown", sets: [] })).toBe(false);
    expect(validSets({ name: "Lat Pulldown", sets: [] })).toEqual([]);
  });

  it("filters out sets with non-finite, zero, or negative weight/reps", () => {
    const ex = {
      sets: [
        { weight: 40, reps: 8 },
        { weight: NaN, reps: 8 },
        { weight: Infinity, reps: 8 },
        { weight: 0, reps: 8 },
        { weight: 40, reps: 0 },
        { weight: 40, reps: undefined },
      ],
    };
    expect(validSets(ex)).toEqual([{ weight: 40, reps: 8 }]);
    expect(hasValidSets(ex)).toBe(true);
  });
});

describe("suggestNextTarget — the -Infinitykg bug", () => {
  it("never returns -Infinity/Infinity/NaN when the most recent session has empty sets", () => {
    const workouts = [
      { date: "2026-08-01", exercises: [{ name: "Barbell Bench Press", sets: [{ weight: 45, reps: 7 }] }] },
      // The most recent session added the exercise but never logged a set for it — this exact
      // shape (sets: []) is what produced "-Infinitykg" before the fix.
      { date: "2026-08-15", exercises: [{ name: "Barbell Bench Press", sets: [] }] },
    ];
    const suggestion = suggestNextTarget(workouts, "Barbell Bench Press", "muscle_growth");
    expect(suggestion.text).not.toMatch(/-?Infinity/);
    expect(suggestion.text).not.toMatch(/NaN/);
    expect(Number.isFinite(suggestion.weight)).toBe(true);
    expect(suggestion.text).toContain("45kg"); // falls back to the last valid session
  });

  it("returns a 'no history yet' message instead of doing math on an empty set when there is no valid history at all", () => {
    const workouts = [{ date: "2026-08-15", exercises: [{ name: "Barbell Bench Press", sets: [] }] }];
    const suggestion = suggestNextTarget(workouts, "Barbell Bench Press", "muscle_growth");
    expect(suggestion.weight).toBeNull();
    expect(suggestion.text).toMatch(/no history/i);
  });

  it("handles an unknown goal by falling back to the general rep range without crashing", () => {
    const workouts = [{ date: "2026-08-01", exercises: [{ name: "Squat (Barbell)", sets: [{ weight: 60, reps: 8 }] }] }];
    expect(() => suggestNextTarget(workouts, "Squat (Barbell)", "some_unknown_goal")).not.toThrow();
  });

  it("suggests a weight increase once every set in the last session hit the top of the rep range", () => {
    const workouts = [{ date: "2026-08-01", exercises: [{ name: "Squat (Barbell)", sets: [{ weight: 60, reps: 12 }, { weight: 60, reps: 13 }] }] }];
    const suggestion = suggestNextTarget(workouts, "Squat (Barbell)", "muscle_growth");
    expect(suggestion.weight).toBeGreaterThan(60);
  });
});

describe("evaluatePR", () => {
  it("treats the first ever set as a PR against empty history without crashing", () => {
    expect(evaluatePR([], 40, 8)).toEqual({ isPR: true, type: "weight" });
  });

  it("ignores non-finite weight/reps in history instead of letting them corrupt Math.max", () => {
    const history = [{ weight: NaN, reps: 8 }, { weight: 40, reps: 8 }];
    const result = evaluatePR(history, 45, 8);
    expect(result.isPR).toBe(true);
    expect(result.type).toBe("weight");
  });

  it("is not a PR when the weight and reps are both below prior history", () => {
    const history = [{ weight: 50, reps: 10 }];
    expect(evaluatePR(history, 40, 8)).toEqual({ isPR: false });
  });
});

describe("computeGamification — XP is derived, never incremented imperatively", () => {
  it("returns the same XP for the same workout history every time it's called (idempotent by construction)", () => {
    const workouts = [
      { exercises: [{ name: "Squat", sets: [{ weight: 60, reps: 8 }] }] },
      { exercises: [{ name: "Bench", sets: [{ weight: 40, reps: 8 }] }] },
    ];
    const a = computeGamification(workouts, 2);
    const b = computeGamification(workouts, 2);
    expect(a.xp).toBe(b.xp);
    expect(a.xp).toBeGreaterThan(0);
  });

  it("never produces NaN XP even when a historical set has a malformed weight/reps value", () => {
    const workouts = [
      { exercises: [{ name: "Squat", sets: [{ weight: NaN, reps: 8 }, { weight: 60, reps: 8 }] }] },
    ];
    const result = computeGamification(workouts, 0);
    expect(Number.isFinite(result.xp)).toBe(true);
    expect(Number.isNaN(result.xp)).toBe(false);
  });

  it("handles an empty workout history without crashing or producing NaN", () => {
    const result = computeGamification([], 0);
    expect(result.xp).toBe(0);
    expect(result.level).toBe(1);
    expect(Number.isFinite(result.totalVolume)).toBe(true);
  });
});
