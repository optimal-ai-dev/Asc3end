import { describe, it, expect } from "vitest";
import { suggestNextTarget, evaluatePR, computeGamification, hasValidSets, validSets, computeStreak, computeWorkoutXp, workoutXpBreakdown } from "./workoutMath";

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

  // Regression for the reported bug: the finish-workout summary showed "+55 XP" but the account's
  // running total actually increased by 65 — the summary's formula and the aggregate formula had
  // silently diverged (the aggregate secretly included a streak bonus the summary didn't). Now
  // both read the exact same stored per-workout breakdown, so this can't happen again.
  it("regression: the running total increases by EXACTLY the newly-finished workout's own xpBreakdown.total", () => {
    const existingWorkouts = [
      { exercises: [{ name: "Squat", sets: [{ weight: 60, reps: 8 }] }], xpBreakdown: computeWorkoutXp({ exercises: [{ name: "Squat", sets: [{ weight: 60, reps: 8 }] }] }, { streakDelta: 1 }) },
    ];
    const before = computeGamification(existingWorkouts, 1);

    const newWorkout = { exercises: [{ name: "Bench", sets: [{ weight: 40, reps: 8 }, { weight: 40, reps: 8 }] }] };
    const breakdown = computeWorkoutXp(newWorkout, { prCount: 1, streakDelta: 1 }); // this is what the finish-summary shows
    const savedWorkout = { ...newWorkout, xpBreakdown: breakdown };
    const after = computeGamification([...existingWorkouts, savedWorkout], 2);

    expect(after.xp - before.xp).toBe(breakdown.total);
  });
});

describe("computeStreak", () => {
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const daysAgoStr = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

  it("is 0 with no workouts logged", () => {
    expect(computeStreak([])).toBe(0);
  });

  it("counts today plus consecutive prior days", () => {
    const workouts = [{ date: todayStr() }, { date: daysAgoStr(1) }, { date: daysAgoStr(2) }];
    expect(computeStreak(workouts)).toBe(3);
  });

  it("still counts a streak that hasn't logged today yet, ending yesterday", () => {
    const workouts = [{ date: daysAgoStr(1) }, { date: daysAgoStr(2) }];
    expect(computeStreak(workouts)).toBe(2);
  });

  it("breaks the streak at the first gap", () => {
    const workouts = [{ date: todayStr() }, { date: daysAgoStr(1) }, { date: daysAgoStr(3) }]; // gap at day 2
    expect(computeStreak(workouts)).toBe(2);
  });
});

describe("computeWorkoutXp — the per-workout breakdown the finish summary displays", () => {
  it("awards nothing for a workout with no logged sets", () => {
    const result = computeWorkoutXp({ exercises: [{ name: "Squat", sets: [] }] });
    expect(result.total).toBe(0);
  });

  it("awards a flat completion bonus plus per-set and per-exercise bonuses", () => {
    const workout = { exercises: [{ name: "Squat", sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }] };
    const result = computeWorkoutXp(workout);
    expect(result.completion).toBe(50);
    expect(result.sets).toBeGreaterThan(0);
    expect(result.prBonus).toBe(0);
    expect(result.streakBonus).toBe(0);
    expect(result.total).toBe(result.completion + result.sets + result.prBonus + result.streakBonus);
  });

  it("adds a PR bonus proportional to prCount", () => {
    const workout = { exercises: [{ name: "Squat", sets: [{ weight: 60, reps: 8 }] }] };
    const withPRs = computeWorkoutXp(workout, { prCount: 2 });
    const withoutPRs = computeWorkoutXp(workout, { prCount: 0 });
    expect(withPRs.total).toBeGreaterThan(withoutPRs.total);
    expect(withPRs.prBonus).toBeGreaterThan(0);
  });

  it("adds a streak bonus only when streakDelta is positive, never for a same-day second workout (delta 0)", () => {
    const workout = { exercises: [{ name: "Squat", sets: [{ weight: 60, reps: 8 }] }] };
    expect(computeWorkoutXp(workout, { streakDelta: 0 }).streakBonus).toBe(0);
    expect(computeWorkoutXp(workout, { streakDelta: 1 }).streakBonus).toBeGreaterThan(0);
  });

  it("never goes negative from a negative prCount/streakDelta input", () => {
    const workout = { exercises: [{ name: "Squat", sets: [{ weight: 60, reps: 8 }] }] };
    const result = computeWorkoutXp(workout, { prCount: -5, streakDelta: -5 });
    expect(result.prBonus).toBe(0);
    expect(result.streakBonus).toBe(0);
  });
});

describe("workoutXpBreakdown", () => {
  it("returns the stored breakdown verbatim for a workout that has one", () => {
    const stored = { completion: 50, sets: 20, prBonus: 15, streakBonus: 10, total: 95 };
    expect(workoutXpBreakdown({ exercises: [], xpBreakdown: stored })).toEqual(stored);
  });

  it("falls back to a legacy approximation for an old workout with no stored breakdown", () => {
    const legacy = { exercises: [{ name: "Squat", sets: [{ weight: 60, reps: 8 }] }] };
    const result = workoutXpBreakdown(legacy);
    expect(Number.isFinite(result.total)).toBe(true);
    expect(result.total).toBeGreaterThan(0);
    expect(result.prBonus).toBe(0);
    expect(result.streakBonus).toBe(0);
  });
});
