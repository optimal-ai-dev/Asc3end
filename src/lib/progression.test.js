import { describe, it, expect } from "vitest";
import { computeProgression, parseTargetRange, resolveTarget, qualifyingSessions, incrementFor, suggestedSetValues } from "./progression";
import { suggestNextTarget, evaluateSetPR, evaluatePR, allTimePrEvents } from "./workoutMath";

let nextId = 1;
const session = (date, exercises, extra = {}) => ({ id: `w${nextId++}`, date, exercises, ...extra });
const bench = (sets, extra = {}) => ({ name: "Barbell Bench Press", sets, ...extra });
const work = (weight, reps, type = "normal") => ({ weight, reps, type });
const BENCH = { exerciseName: "Barbell Bench Press", trackingType: "weight_reps", goal: "muscle_growth", equipment: "Barbell" };

describe("warm-up contamination (audit finding 1)", () => {
  const history = [
    session("2026-09-20", [bench([work(60, 8, "warmup"), work(85, 10), work(85, 9), work(85, 8)])]),
  ];

  it("recommends staying at 85 kg from working history", () => {
    const p = computeProgression({ workouts: history, ...BENCH });
    expect(p.weight).toBe(85);
    expect(p.action).toBe("hold");
  });

  it("working history at 85 kg followed by a session of only 20 kg warm-ups does NOT produce a 20 kg baseline", () => {
    const workouts = [...history, session("2026-10-08", [bench([work(20, 5, "warmup")])])];
    const p = computeProgression({ workouts, ...BENCH });
    expect(p.weight).toBe(85);
    expect(p.source.date).toBe("2026-09-20");
    expect(p.text).toContain("85");
    expect(p.text).not.toMatch(/\b20\s?kg/);
    // the legacy entry point used by the logger agrees
    expect(suggestNextTarget(workouts, "Barbell Bench Press", "muscle_growth").weight).toBe(85);
  });

  it("an empty session (exercise added, nothing logged) preserves the baseline", () => {
    const workouts = [...history, session("2026-10-08", [bench([])])];
    expect(computeProgression({ workouts, ...BENCH }).weight).toBe(85);
  });

  it("a warm-up-only session AND an empty session after the working one still preserve it", () => {
    const workouts = [...history, session("2026-10-07", [bench([work(20, 5, "warmup")])]), session("2026-10-08", [bench([])])];
    const p = computeProgression({ workouts, ...BENCH });
    expect(p.weight).toBe(85);
    expect(p.source.date).toBe("2026-09-20");
  });

  it("a newer valid working session DOES update the baseline", () => {
    const workouts = [...history, session("2026-10-06", [bench([work(20, 5, "warmup"), work(87.5, 8), work(87.5, 8)])])];
    const p = computeProgression({ workouts, ...BENCH });
    expect(p.source.date).toBe("2026-10-06");
    expect(p.baseline.topWeight).toBe(87.5);
    expect(p.weight).toBe(87.5);
  });

  it("a warm-up heavier than a later working set cannot become the baseline either", () => {
    const workouts = [session("2026-10-01", [bench([work(100, 1, "warmup"), work(80, 8)])])];
    expect(computeProgression({ workouts, ...BENCH }).baseline.topWeight).toBe(80);
  });
});

describe("set kinds", () => {
  it("drop sets and deload sets are never the baseline", () => {
    const workouts = [
      session("2026-10-01", [bench([work(80, 10), work(60, 12, "drop")])]),
      session("2026-10-08", [bench([work(50, 10, "deload"), work(50, 10, "deload")])]),
    ];
    const p = computeProgression({ workouts, ...BENCH });
    expect(p.baseline.topWeight).toBe(80);
    expect(p.source.date).toBe("2026-10-01");
  });

  it("failure sets are valid working sets and count as the baseline", () => {
    const workouts = [session("2026-10-01", [bench([work(80, 6, "failure")])])];
    expect(computeProgression({ workouts, ...BENCH }).baseline.topWeight).toBe(80);
  });

  it("legacy sets with no type, or the old 'working' type, are ordinary working sets", () => {
    const workouts = [session("2026-10-01", [bench([{ weight: 70, reps: 10 }, { weight: 70, reps: 9, type: "working" }])])];
    expect(computeProgression({ workouts, ...BENCH }).baseline.topWeight).toBe(70);
  });

  it("drop sets and warm-ups cannot set PRs and do not raise the bar", () => {
    const hist = [work(100, 5, "warmup"), work(60, 10)];
    expect(evaluateSetPR(hist, work(65, 8), "weight_reps")).toEqual({ isPR: true, type: "weight" });
    expect(evaluateSetPR([work(60, 10)], work(200, 1, "drop"), "weight_reps")).toEqual({ isPR: false });
    expect(evaluateSetPR([work(60, 10)], work(30, 5, "warmup"), "weight_reps")).toEqual({ isPR: false });
    expect(evaluatePR([work(60, 10)], 60, 11)).toEqual({ isPR: true, type: "reps" });
  });
});

describe("rep range, increments and progression decisions", () => {
  it("increases by the equipment's increment once every top-weight set hits the top of the range", () => {
    const workouts = [session("2026-10-01", [bench([work(80, 12), work(80, 12), work(80, 12)])])];
    const p = computeProgression({ workouts, ...BENCH });
    expect(p.action).toBe("increase");
    expect(p.weight).toBe(82.5);
    expect(p.targetReps).toBe(8);
  });

  it("uses dumbbell and machine increments, not a one-size-fits-all 2.5", () => {
    const db = [session("2026-10-01", [{ name: "Dumbbell Curl", sets: [work(14, 12), work(14, 12)] }])];
    expect(computeProgression({ workouts: db, exerciseName: "Dumbbell Curl", trackingType: "weight_reps", goal: "muscle_growth", equipment: "Dumbbell" }).weight).toBe(16);
    expect(incrementFor("Machine")).toBe(5);
    expect(incrementFor("Barbell", "kg", { Barbell: 1.25 })).toBe(1.25);
  });

  it("only sets AT the top weight decide the progression; a light back-off set does not hold it back", () => {
    const workouts = [session("2026-10-01", [bench([work(80, 12), work(80, 12), work(70, 8)])])];
    expect(computeProgression({ workouts, ...BENCH }).action).toBe("increase");
  });

  it("holds and pushes the weakest set when the range is not yet reached", () => {
    const workouts = [session("2026-10-01", [bench([work(80, 10), work(80, 8)])])];
    const p = computeProgression({ workouts, ...BENCH });
    expect(p.action).toBe("hold");
    expect(p.targetReps).toBe(9);
    expect(p.text).toMatch(/Stay at 80kg/);
  });

  it("converts units: lb users get lb text and lb-sized jumps", () => {
    const workouts = [session("2026-10-01", [bench([work(185, 12), work(185, 12)])])];
    const p = computeProgression({ workouts, ...BENCH, unit: "lb" });
    expect(p.unit).toBe("lb");
    expect(p.text).toMatch(/lb/);
    expect(p.weight).toBeGreaterThan(185);
    expect(p.weight % 2.5).toBe(0);
  });

  it("states where the recommendation came from", () => {
    const workouts = [session("2026-10-01", [bench([work(80, 10)])], { id: "abc" })];
    const p = computeProgression({ workouts, ...BENCH });
    expect(p.source).toEqual({ workoutId: "abc", date: "2026-10-01" });
    expect(p.text).toContain("2026-10-01");
  });
});

describe("rep-target changes produce coherent guidance", () => {
  const hist = [session("2026-10-01", [bench([work(85, 10), work(85, 10), work(85, 9)], { targetReps: "8-12" })])];

  it("same plan range: ordinary hold at the same weight", () => {
    const p = computeProgression({ workouts: hist, ...BENCH, planTarget: "8-12" });
    expect(p.weight).toBe(85);
    expect(p.rangeSource).toBe("plan");
  });

  it("a plan moving to 15-20 reps lowers the suggested weight (estimated, with an explanation) instead of repeating 85 kg", () => {
    const p = computeProgression({ workouts: hist, ...BENCH, planTarget: "15-20" });
    expect(p.action).toBe("adjust_range");
    expect(p.weight).toBeLessThan(85);
    expect(p.weight).toBeGreaterThan(50);
    expect(p.text).toMatch(/15-20/);
    expect(p.text).toMatch(/changed from 8-12 to 15-20/);
  });

  it("a plan moving to 4-6 reps raises it", () => {
    const heavyPlan = computeProgression({ workouts: hist, ...BENCH, planTarget: "4-6" });
    expect(heavyPlan.weight).toBeGreaterThan(85);
  });

  it("the target is resolved in ONE place: plan, else goal, else default", () => {
    expect(resolveTarget({ planTarget: "15-20", trackingType: "weight_reps", goal: "strength" })).toMatchObject({ lo: 15, hi: 20, source: "plan" });
    expect(resolveTarget({ trackingType: "weight_reps", goal: "strength" })).toMatchObject({ lo: 4, hi: 6, source: "goal" });
    expect(resolveTarget({ trackingType: "weight_reps", goal: "???" })).toMatchObject({ lo: 8, hi: 12, source: "default" });
  });

  it("parses plan targets robustly and rejects nonsense", () => {
    expect(parseTargetRange("8-12")).toEqual({ lo: 8, hi: 12, unit: "reps" });
    expect(parseTargetRange("10")).toEqual({ lo: 10, hi: 10, unit: "reps" });
    expect(parseTargetRange("8–12")).toEqual({ lo: 8, hi: 12, unit: "reps" });
    expect(parseTargetRange("30-45s")).toEqual({ lo: 30, hi: 45, unit: "seconds" });
    expect(parseTargetRange("1 min")).toEqual({ lo: 60, hi: 60, unit: "seconds" });
    expect(parseTargetRange("AMRAP")).toBeNull();
    expect(parseTargetRange("12-8")).toBeNull();
    expect(parseTargetRange(null)).toBeNull();
  });
});

describe("historical correction updates the next recommendation (nothing is cached)", () => {
  it("fixing a mistyped set changes the recommendation immediately", () => {
    const original = [session("2026-10-01", [bench([work(80, 12), work(80, 12), work(80, 12)])], { id: "x" })];
    expect(computeProgression({ workouts: original, ...BENCH }).action).toBe("increase");
    const corrected = original.map((w) => ({ ...w, exercises: [bench([work(80, 8), work(80, 8), work(80, 8)])] }));
    const p = computeProgression({ workouts: corrected, ...BENCH });
    expect(p.action).toBe("hold");
    expect(p.targetReps).toBe(9);
  });

  it("re-labelling the only working set as a warm-up removes it as a baseline", () => {
    const wk = [session("2026-10-01", [bench([work(80, 8), work(80, 8)])])];
    const fixed = [{ ...wk[0], exercises: [bench([work(80, 8, "warmup"), work(80, 8, "warmup")])] }];
    expect(computeProgression({ workouts: fixed, ...BENCH }).action).toBe("start");
  });
});

describe("exercise measurement types", () => {
  it("plank: duration-aware first-session guidance, never 'weight for 8-12 reps'", () => {
    const p = computeProgression({ workouts: [], exerciseName: "Plank", trackingType: "isometric_hold", goal: "muscle_growth", planTarget: "8-12" });
    expect(p.text).toMatch(/Hold/i);
    expect(p.text).not.toMatch(/weight|reps/i);
    expect(p.target.kind).toBe("seconds");
  });

  it("plank progression works in seconds and ignores warm-up holds", () => {
    const workouts = [
      session("2026-10-01", [{ name: "Plank", trackingType: "isometric_hold", sets: [{ durationSeconds: 45, type: "normal" }, { durationSeconds: 50, type: "normal" }] }]),
      session("2026-10-08", [{ name: "Plank", trackingType: "isometric_hold", sets: [{ durationSeconds: 10, type: "warmup" }] }]),
    ];
    const p = computeProgression({ workouts, exerciseName: "Plank", trackingType: "isometric_hold", goal: "muscle_growth" });
    expect(p.source.date).toBe("2026-10-01");
    expect(p.text).toMatch(/0:50|50/);
    expect(p.text).not.toMatch(/kg|reps/);
  });

  it("plank: every hold reaching the top of the window suggests a longer hold, not a weight", () => {
    const workouts = [session("2026-10-01", [{ name: "Plank", trackingType: "isometric_hold", sets: [{ durationSeconds: 60 }, { durationSeconds: 65 }] }])];
    const p = computeProgression({ workouts, exerciseName: "Plank", trackingType: "isometric_hold" });
    expect(p.action).toBe("increase");
    expect(p.targetSeconds).toBeGreaterThan(60);
    expect(p.weight).toBeNull();
  });

  it("assisted pull-ups progress by REDUCING assistance", () => {
    const workouts = [session("2026-10-01", [{ name: "Assisted Pull-Up", trackingType: "assisted_bodyweight", sets: [{ reps: 12, assistWeight: 30 }, { reps: 12, assistWeight: 30 }] }])];
    const p = computeProgression({ workouts, exerciseName: "Assisted Pull-Up", trackingType: "assisted_bodyweight", goal: "muscle_growth", equipment: "Assisted Bodyweight" });
    expect(p.action).toBe("increase");
    expect(p.assistWeight).toBe(27.5);
    expect(p.text).toMatch(/Reduce assistance/);
  });

  it("bodyweight pull-ups progress by reps, and a legitimate 0 added weight is a real baseline", () => {
    const workouts = [session("2026-10-01", [{ name: "Pull-Up", trackingType: "bodyweight_reps", sets: [{ reps: 8, weight: 0 }, { reps: 7, weight: 0 }] }])];
    const p = computeProgression({ workouts, exerciseName: "Pull-Up", trackingType: "bodyweight_reps", goal: "muscle_growth" });
    expect(p.action).toBe("hold");
    expect(p.baseline.bestReps).toBe(8);
  });

  it("distance work has no overload maths, just 'match or beat'", () => {
    const workouts = [session("2026-10-01", [{ name: "Treadmill Run", trackingType: "distance_duration", sets: [{ distanceMeters: 5000, durationSeconds: 1500 }] }])];
    const p = computeProgression({ workouts, exerciseName: "Treadmill Run", trackingType: "distance_duration" });
    expect(p.text).toMatch(/match or beat/);
  });
});

describe("misc", () => {
  it("qualifyingSessions skips sessions without an eligible set and orders newest first", () => {
    const workouts = [
      session("2026-10-01", [bench([work(80, 8)])]),
      session("2026-10-05", [bench([work(20, 5, "warmup")])]),
      session("2026-10-03", [bench([work(82.5, 8)])]),
    ];
    const q = qualifyingSessions(workouts, "Barbell Bench Press", "weight_reps");
    expect(q.map((s) => s.workout.date)).toEqual(["2026-10-03", "2026-10-01"]);
  });

  it("never emits NaN/undefined/Infinity in text", () => {
    const weird = [session("2026-10-01", [bench([{ weight: NaN, reps: 8 }, { weight: 50, reps: undefined }, work(60, 8)])])];
    const p = computeProgression({ workouts: weird, ...BENCH });
    expect(p.text).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("suggestedSetValues pre-fills only concrete numbers", () => {
    const workouts = [session("2026-10-01", [bench([work(80, 12), work(80, 12)])])];
    const p = computeProgression({ workouts, ...BENCH });
    expect(suggestedSetValues(p, "weight_reps")).toEqual({ weight: 82.5, reps: 8 });
    expect(suggestedSetValues({ action: "start" }, "weight_reps")).toEqual({});
  });

  it("PR timeline ignores warm-ups and is measurement-aware", () => {
    const workouts = [
      session("2026-10-01", [bench([work(100, 3, "warmup"), work(80, 8)])]),
      session("2026-10-08", [bench([work(82.5, 8)]), { name: "Plank", trackingType: "isometric_hold", sets: [{ durationSeconds: 45 }] }]),
    ];
    const events = allTimePrEvents(workouts);
    const benchEvents = events.filter((e) => e.name === "Barbell Bench Press");
    expect(benchEvents.map((e) => e.set.weight)).toEqual([80, 82.5]);
    const plank = events.find((e) => e.name === "Plank");
    expect(plank.type).toBe("duration");
    expect(plank.set).toEqual({ durationSeconds: 45 });
  });
});
