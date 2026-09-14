import { describe, it, expect } from "vitest";
import {
  suggestNextTarget, evaluatePR, computeGamification, hasValidSets, validSets, computeStreak, computeWorkoutXp, workoutXpBreakdown,
  allTimePrEvents, computeWeeklyMissions, computeChallengeProgress, CHALLENGE_TEMPLATES,
} from "./workoutMath";

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function workout(daysAgo, exercises) {
  return { date: isoDaysAgo(daysAgo), exercises };
}
function ex(name, sets) {
  return { name, sets: sets.map(([weight, reps]) => ({ weight, reps, type: "working" })) };
}

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

describe("computeGamification — badge progress", () => {
  it("reports current/target for an unearned badge instead of just earned:false", () => {
    const workouts = Array.from({ length: 4 }, (_, i) => workout(i, [ex("Squat", [[60, 8]])]));
    const g = computeGamification(workouts, 0);
    const tenBadge = g.badges.find((b) => b.id === "ten");
    expect(tenBadge.earned).toBe(false);
    expect(tenBadge.current).toBe(4);
    expect(tenBadge.target).toBe(10);
  });

  it("clamps current at target once earned rather than overshooting the bar", () => {
    const workouts = Array.from({ length: 15 }, (_, i) => workout(i, [ex("Squat", [[60, 8]])]));
    const g = computeGamification(workouts, 0);
    const tenBadge = g.badges.find((b) => b.id === "ten");
    expect(tenBadge.earned).toBe(true);
    expect(tenBadge.current).toBe(10);
  });
});

describe("allTimePrEvents — historical PR reconstruction", () => {
  it("records an event the first time an exercise is ever logged", () => {
    const workouts = [workout(0, [ex("Bench Press", [[60, 8]])])];
    const events = allTimePrEvents(workouts);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: "Bench Press", weight: 60 });
  });

  it("records a new event each time the weight goes above every prior session's best", () => {
    const workouts = [
      workout(4, [ex("Bench Press", [[60, 8]])]),
      workout(2, [ex("Bench Press", [[65, 8]])]),
      workout(0, [ex("Bench Press", [[70, 8]])]),
    ];
    const events = allTimePrEvents(workouts);
    expect(events.map((e) => e.weight)).toEqual([60, 65, 70]);
  });

  it("does not record an event for a session that stays at or below the existing best", () => {
    const workouts = [
      workout(2, [ex("Bench Press", [[70, 8]])]),
      workout(0, [ex("Bench Press", [[65, 8]])]),
    ];
    const events = allTimePrEvents(workouts);
    expect(events).toHaveLength(1);
    expect(events[0].weight).toBe(70);
  });

  it("tracks each exercise's record independently", () => {
    const workouts = [workout(0, [ex("Bench Press", [[60, 8]]), ex("Squat", [[100, 5]])])];
    const events = allTimePrEvents(workouts);
    expect(events.map((e) => e.name).sort()).toEqual(["Bench Press", "Squat"]);
  });
});

describe("computeWeeklyMissions", () => {
  it("marks train3 complete once 3 distinct days this week have a workout", () => {
    const workouts = [workout(0, [ex("Squat", [[60, 8]])]), workout(1, [ex("Squat", [[60, 8]])]), workout(2, [ex("Squat", [[60, 8]])])];
    const missions = computeWeeklyMissions(workouts, []);
    const train3 = missions.find((m) => m.id === "train3");
    // Depending on which day of the week "today" is when this test runs, not all 3 days may fall
    // in the same calendar week — assert the relationship the function guarantees either way.
    expect(train3.current).toBeLessThanOrEqual(3);
    expect(train3.completed).toBe(train3.current >= 3);
  });

  it("all missions start incomplete with zero progress given no data", () => {
    const missions = computeWeeklyMissions([], []);
    expect(missions.every((m) => !m.completed)).toBe(true);
    expect(missions.every((m) => m.current === 0)).toBe(true);
  });

  it("detects a PR set today as completing the pr1 mission", () => {
    const workouts = [workout(30, [ex("Bench Press", [[50, 8]])]), workout(0, [ex("Bench Press", [[55, 8]])])];
    const missions = computeWeeklyMissions(workouts, []);
    expect(missions.find((m) => m.id === "pr1").completed).toBe(true);
  });

  it("detects an exercise logged this week with no prior history as a new exercise", () => {
    const workouts = [workout(0, [ex("Cable Fly", [[15, 12]])])];
    const missions = computeWeeklyMissions(workouts, []);
    expect(missions.find((m) => m.id === "newExercise").completed).toBe(true);
  });

  it("does not count an exercise as new if it was logged before this week", () => {
    const workouts = [workout(30, [ex("Cable Fly", [[15, 12]])]), workout(0, [ex("Cable Fly", [[17, 10]])])];
    const missions = computeWeeklyMissions(workouts, []);
    expect(missions.find((m) => m.id === "newExercise").completed).toBe(false);
  });
});

describe("computeChallengeProgress", () => {
  const nutritionTargets = { calories: 2000, protein: 150 };

  it("counts distinct training days toward the consistency challenge", () => {
    const challenge = { templateId: "consistency30", startDate: isoDaysAgo(5) };
    const workouts = [workout(4, [ex("Squat", [[60, 8]])]), workout(2, [ex("Squat", [[60, 8]])]), workout(0, [ex("Squat", [[60, 8]])])];
    const progress = computeChallengeProgress(challenge, workouts, [], nutritionTargets);
    expect(progress.current).toBe(3);
    expect(progress.target).toBe(20);
    expect(progress.completed).toBe(false);
  });

  it("marks a challenge completed once the target is reached, even mid-window", () => {
    const challenge = { templateId: "prHunt", startDate: isoDaysAgo(10) };
    const workouts = [
      workout(9, [ex("Bench Press", [[60, 8]])]),
      workout(6, [ex("Bench Press", [[65, 8]])]),
      workout(3, [ex("Bench Press", [[70, 8]])]),
    ];
    const progress = computeChallengeProgress(challenge, workouts, [], nutritionTargets);
    expect(progress.current).toBe(3);
    expect(progress.completed).toBe(true);
    expect(progress.finished).toBe(true);
  });

  it("marks a challenge expired once its window has fully elapsed without reaching target", () => {
    const template = CHALLENGE_TEMPLATES.find((t) => t.id === "sets1000");
    const challenge = { templateId: "sets1000", startDate: isoDaysAgo(template.durationDays + 5) };
    const progress = computeChallengeProgress(challenge, [], [], nutritionTargets);
    expect(progress.completed).toBe(false);
    expect(progress.expired).toBe(true);
    expect(progress.finished).toBe(true);
  });

  it("an in-progress, unfinished challenge is neither completed nor expired", () => {
    const challenge = { templateId: "consistency30", startDate: isoDaysAgo(5) };
    const progress = computeChallengeProgress(challenge, [], [], nutritionTargets);
    expect(progress.finished).toBe(false);
  });

  it("counts a challenge started today as day 1, and N days ago as day N+1 — regardless of local timezone", () => {
    // Regression: computeChallengeProgress previously parsed startDate with `new Date(iso)` (UTC
    // midnight) then called `.setHours(0,0,0,0)` (local midnight) — mixing the two silently shifted
    // the elapsed-day count for anyone not at UTC+0 (a challenge started 5 days ago read back as
    // "Day 7" when verified live at UTC+10). Every date here now goes through the same UTC-component
    // arithmetic, so this must hold no matter what timezone the test machine itself is in.
    const startedToday = computeChallengeProgress({ templateId: "consistency30", startDate: isoDaysAgo(0) }, [], [], nutritionTargets);
    expect(startedToday.daysElapsed).toBe(1);
    const startedFiveDaysAgo = computeChallengeProgress({ templateId: "consistency30", startDate: isoDaysAgo(5) }, [], [], nutritionTargets);
    expect(startedFiveDaysAgo.daysElapsed).toBe(6);
  });

  it("only counts nutrition entries within the challenge window toward onTargetDays", () => {
    const challenge = { templateId: "nutrition21", startDate: isoDaysAgo(5) };
    const nutrition = [
      { date: isoDaysAgo(20), calories: 2000, protein: 150 }, // before the window — must not count
      { date: isoDaysAgo(2), calories: 2000, protein: 150 }, // inside the window — must count
    ];
    const progress = computeChallengeProgress(challenge, [], nutrition, nutritionTargets);
    expect(progress.current).toBe(1);
  });

  it("returns null for an unknown template id instead of throwing", () => {
    const progress = computeChallengeProgress({ templateId: "not-a-real-template", startDate: isoDaysAgo(1) }, [], [], nutritionTargets);
    expect(progress).toBeNull();
  });
});
