import { describe, it, expect } from "vitest";
import { EXERCISES, getExerciseGuidance, regionForExercise, MUSCLE_GROUPS } from "./exerciseData.js";
import { MEASUREMENT_TYPES, specFor } from "./lib/measurement.js";
import { figureFidelity, FIGURE_RULES } from "./exerciseMedia.js";
import { computeProgression, resolveTarget } from "./lib/progression.js";

// Programmatic consistency audit across the WHOLE catalogue (every exercise), plus an explicit
// table of commonly used exercises. These checks exist because the live audit found: a Pec Deck
// described as a chest press, flies/pullovers/skull crushers sharing a bench-press figure, a Plank
// told to "select a weight for 8-12 reps", and mislabelled measurement types.

const text = (g) => [g.setup, g.execution, g.breathingCue, ...g.formCues, ...g.commonMistakes, g.safetyNote].filter(Boolean).join(" ");
// What the exercise tells you to DO (mistakes legitimately describe what not to do, e.g. "turning it into a press")
const instructions = (g) => [g.setup, g.execution, g.breathingCue, ...g.formCues].filter(Boolean).join(" ");
const by = (name) => EXERCISES.find((e) => e.name === name);

describe("every exercise: measurement type is coherent", () => {
  it("has a supported measurement type", () => {
    for (const e of EXERCISES) expect(MEASUREMENT_TYPES, e.name).toContain(e.trackingType);
  });

  it("holds are timed: plank-family exercises are logged as time (or loaded time), never weight x reps", () => {
    const holds = EXERCISES.filter((e) => /\b(plank|wall sit|dead hang|hollow hold|copenhagen)\b/i.test(e.name) && !/shoulder tap/i.test(e.name));
    expect(holds.length).toBeGreaterThanOrEqual(5);
    for (const e of holds) expect(["isometric_hold", "weighted_duration"], `${e.name} is ${e.trackingType}`).toContain(e.trackingType);
  });

  it("timed exercises are never described in reps or weight, anywhere in their instructions", () => {
    const timed = EXERCISES.filter((e) => ["isometric_hold", "duration"].includes(e.trackingType));
    expect(timed.length).toBeGreaterThan(5);
    for (const e of timed) {
      const t = text(getExerciseGuidance(e));
      expect(t, `${e.name} instructions mention reps`).not.toMatch(/\breps?\b|\brepetitions?\b/i);
      expect(t, `${e.name} instructions mention a weight`).not.toMatch(/\bselect a weight\b|\bchoose a weight\b|\bheavier\b|\bweight\b/i);
    }
  });

  it("bodyweight/band/suspension/stability-ball exercises are never plain weight x reps (no kg to enter)", () => {
    const allowedWeighted = new Set(["Svend Press", "Ankle Weight Hip Abduction"]);
    const bad = EXERCISES.filter((e) => ["Bodyweight", "Resistance Band", "Suspension Trainer", "Stability Ball"].includes(e.equipment) && e.trackingType === "weight_reps" && !allowedWeighted.has(e.name));
    expect(bad.map((e) => `${e.name} (${e.equipment})`)).toEqual([]);
  });

  it("assisted movements are logged as assistance; weighted bodyweight movements allow added load", () => {
    for (const e of EXERCISES.filter((x) => /assisted/i.test(x.name))) expect(e.trackingType, e.name).toBe("assisted_bodyweight");
    for (const e of EXERCISES.filter((x) => /^weighted /i.test(x.name) && x.equipment === "Bodyweight")) expect(["bodyweight_plus_weight", "weighted_duration"], e.name).toContain(e.trackingType);
  });

  it("cardio machines and runs are distance/time; carries and sleds record weight and distance", () => {
    for (const e of EXERCISES.filter((x) => x.equipment === "Cardio Machine")) expect(e.trackingType, e.name).toBe("distance_duration");
    for (const e of EXERCISES.filter((x) => /\bsled\b|prowler|farmer's carry|yoke carry/i.test(x.name) && x.pose === "carry" && !/hold/i.test(x.name))) expect(["weight_distance", "per_side_weight"], e.name).toContain(e.trackingType);
  });

  it("no exercise offers a 1RM or tonnage unless its measurement type supports it", () => {
    for (const e of EXERCISES) {
      const spec = specFor(e.trackingType);
      if (["isometric_hold", "duration", "distance_duration", "assisted_bodyweight", "reps_only", "bodyweight_reps"].includes(e.trackingType)) {
        expect(spec.e1rm, e.name).toBe(false);
        expect(spec.volume, e.name).toBeNull();
      }
    }
  });
});

describe("every exercise: instructions are present and specific", () => {
  it("has non-empty setup and execution", () => {
    const missing = EXERCISES.filter((e) => { const g = getExerciseGuidance(e); return !g.setup || !g.execution; }).map((e) => `${e.name} (${e.pose})`);
    expect(missing).toEqual([]);
  });

  it("flies, pec decks and pullovers are never described as presses", () => {
    const flies = EXERCISES.filter((e) => /\bfly\b|pec deck|pullover/i.test(e.name) && !/reverse|rear delt/i.test(e.name));
    expect(flies.length).toBeGreaterThanOrEqual(10);
    for (const e of flies) {
      // "this is a fly, not a press" is the instruction clarifying the movement, not describing one
      const t = instructions(getExerciseGuidance(e)).replace(/not an? (chest |overhead )?press/gi, "");
      expect(t, `${e.name} reads like a press`).not.toMatch(/\bpress(es|ing)?\b|lockout/i);
    }
  });

  it("curls are never described as presses or pulls to the chest", () => {
    for (const e of EXERCISES.filter((x) => /\bcurl\b/i.test(x.name) && !/leg|nordic|wrist|neck|hamstring/i.test(x.name))) {
      expect(text(getExerciseGuidance(e)), e.name).not.toMatch(/\bpress(es|ing)?\b/i);
    }
  });

  it("pulldowns, pull-ups and rows describe pulling", () => {
    for (const e of EXERCISES.filter((x) => /pulldown|pull-up|chin-up|\brow\b/i.test(x.name) && !/jump|renegade|upright/i.test(x.name))) {
      expect(text(getExerciseGuidance(e)), e.name).toMatch(/pull|row|elbow|hang/i);
    }
  });

  it("tibialis raises are not described as calf raises", () => {
    for (const e of EXERCISES.filter((x) => /tibialis/i.test(x.name))) {
      const g = getExerciseGuidance(e);
      expect(g.execution, e.name).toMatch(/toes? (up|toward)|shins/i);
      expect(g.execution, e.name).not.toMatch(/press up onto the toes/i);
    }
  });

  it("instruction text never names the wrong implement (a cable exercise never says 'barbell', a bodyweight one never says 'weight plate')", () => {
    for (const e of EXERCISES.filter((x) => x.equipment === "Cable")) expect(text(getExerciseGuidance(e)), e.name).not.toMatch(/\bbarbell\b/i);
  });
});

describe("every exercise: muscle and equipment mapping", () => {
  it("equipment named in the exercise name matches its equipment field", () => {
    const rules = [["Dumbbell", "Dumbbell"], ["Barbell", "Barbell"], ["Cable", "Cable"], ["Kettlebell", "Kettlebell"], ["Smith Machine", "Smith Machine"], ["Landmine", "Landmine"], ["Trap Bar", "Trap Bar"]];
    const bad = [];
    for (const e of EXERCISES) for (const [word, eq] of rules) if (e.name.includes(word) && e.equipment !== eq) bad.push(`${e.name}: name says ${eq}, equipment is ${e.equipment}`);
    expect(bad).toEqual([]);
  });

  it("muscle keywords in the name map to the right region", () => {
    const expectRegion = (re, regions, exclude) => {
      for (const e of EXERCISES.filter((x) => re.test(x.name) && !(exclude && exclude.test(x.name)))) {
        expect(regions, `${e.name} -> ${regionForExercise(e)}`).toContain(regionForExercise(e));
      }
    };
    expectRegion(/skull crusher|pushdown|tricep|kickback/i, ["triceps", "glutes"], /cable kickback|machine kickback/i);
    expectRegion(/calf raise/i, ["calves"], /tibialis/i);
    expectRegion(/tibialis/i, ["tibialisAnterior"]);
    expectRegion(/adduction|adductor/i, ["adductors"], /\(abduction\)/i);
    expectRegion(/abduction|abductor/i, ["abductors", "glutes"], /\(adduction\)/i);
    expectRegion(/shrug/i, ["traps"]);
    expectRegion(/lateral raise/i, ["sideDelts"], /bent over|rear/i);
    expectRegion(/\bbicep|\bcurl\b/i, ["biceps", "forearms", "hamstrings", "traps", "abs", "lats"], /leg curl|nordic|wrist|neck|hamstring|plate neck/i);
  });

  it("every exercise's primary region is a real readiness region and its group is a real group", () => {
    for (const e of EXERCISES) {
      expect(regionForExercise(e), e.name).toBeTruthy();
      expect(MUSCLE_GROUPS, e.name).toContain(e.muscle);
    }
  });
});

describe("illustrations: no inaccurate figure is presented as a precise demonstration", () => {
  it("every approved exercise passes its figure rule, and every rule names what its artwork depicts", () => {
    for (const [pose, rule] of Object.entries(FIGURE_RULES)) expect(rule.depicts.length, pose).toBeGreaterThan(30);
    for (const e of EXERCISES.filter((x) => x.mediaStatus === "approved")) expect(figureFidelity(e).approved, e.name).toBe(true);
  });

  it("the previously mismatched exercises no longer show a borrowed figure", () => {
    for (const name of ["Pec Deck Machine", "Seated Fly Machine", "Dumbbell Fly", "Incline Dumbbell Fly", "Dumbbell Pullover", "Cable Pullover", "Skull Crusher", "Tate Press", "JM Press", "Svend Press", "High-to-Low Cable Fly", "Cable Lateral Raise", "Dead Bug", "Bird Dog", "Pallof Press", "Ab Wheel Rollout", "Tibialis Raises", "Seated Cable Row", "Dumbbell Row", "Machine Shoulder Press", "Overhead Rope Extension", "Straight Arm Pulldown", "Incline Dumbbell Press", "Decline Push-Up"]) {
      expect(by(name).mediaStatus, name).toBe("pending");
    }
  });

  it("approved figures are limited to exercises the artwork really depicts, including the rebuilt Rope Pushdown", () => {
    for (const name of ["Rope Pushdown", "Straight Bar Pushdown", "V-Bar Pushdown", "Barbell Bench Press", "Back Squat", "Lat Pulldown", "Plank", "Pull-Up", "Dumbbell Curl"]) {
      expect(by(name).mediaStatus, name).toBe("approved");
    }
    expect(by("Rope Pushdown").pose).toBe("pushdown");
  });
});

// ---------------------------------------------------------------------------------------------
// 60+ commonly used exercises: expected equipment / primary region / logging type / figure status.
// presses vs flies, rows vs pulldowns, hinges, curls, timed holds, unilateral and assisted work.
const AUDITED = [
  // presses vs flies
  ["Barbell Bench Press", "Barbell", "chest", "weight_reps", "approved"],
  ["Flat Dumbbell Press", "Dumbbell", "chest", "weight_reps", "approved"],
  ["Incline Dumbbell Press", "Dumbbell", "chest", "weight_reps", "pending"],
  ["Chest Press Machine", "Machine", "chest", "weight_reps", "approved"],
  ["Pec Deck Machine", "Machine", "chest", "weight_reps", "pending"],
  ["Dumbbell Fly", "Dumbbell", "chest", "weight_reps", "pending"],
  ["Mid Cable Fly", "Cable", "chest", "weight_reps", "pending"],
  ["Push-Up", "Bodyweight", "chest", "bodyweight_reps", "approved"],
  ["Overhead Press (Barbell)", "Barbell", "frontDelts", "weight_reps", "approved"],
  ["Dumbbell Lateral Raise", "Dumbbell", "sideDelts", "weight_reps", "approved"],
  ["Cable Lateral Raise", "Cable", "sideDelts", "weight_reps", "pending"],
  ["Rear Delt Fly", "Dumbbell", "rearDelts", "weight_reps", "approved"],
  ["Face Pull", "Cable", "rearDelts", "weight_reps", "pending"],
  // rows vs pulldowns
  ["Lat Pulldown", "Cable", "lats", "weight_reps", "approved"],
  ["Pull-Up", "Bodyweight", "lats", "bodyweight_reps", "approved"],
  ["Assisted Pull-Up", "Assisted Bodyweight", "lats", "assisted_bodyweight", "pending"],
  ["Barbell Row", "Barbell", "upperBack", "weight_reps", "approved"],
  ["Seated Cable Row", "Cable", "upperBack", "weight_reps", "pending"],
  ["Dumbbell Row", "Dumbbell", "upperBack", "weight_reps", "pending"],
  ["T-Bar Row", "Machine", "upperBack", "weight_reps", "pending"],
  ["Inverted Row", "Bodyweight", "upperBack", "bodyweight_reps", "pending"],
  ["Straight Arm Pulldown", "Cable", "lats", "weight_reps", "pending"],
  // hinges
  ["Deadlift", "Barbell", "lowerBack", "weight_reps", "approved"],
  ["Romanian Deadlift", "Barbell", "hamstrings", "weight_reps", "approved"],
  ["Hip Thrust", "Barbell", "glutes", "weight_reps", "approved"],
  ["Kettlebell Swing", "Kettlebell", "glutes", "weight_reps", "pending"],
  ["Back Extension", "Bodyweight", "lowerBack", "bodyweight_reps", "pending"],
  // legs
  ["Back Squat", "Barbell", "quads", "weight_reps", "approved"],
  ["Leg Press", "Machine", "quads", "weight_reps", "approved"],
  ["Leg Extension", "Machine", "quads", "weight_reps", "approved"],
  ["Lying Leg Curl", "Machine", "hamstrings", "weight_reps", "approved"],
  ["Walking Lunge", "Dumbbell", "quads", "weight_reps", "pending"],
  ["Bulgarian Split Squat", "Dumbbell", "quads", "weight_reps", "approved"],
  ["Standing Calf Raise", "Machine", "calves", "weight_reps", "approved"],
  ["Tibialis Raises", "Bodyweight", "tibialisAnterior", "bodyweight_reps", "pending"],
  ["Hip Abduction Machine", "Machine", "abductors", "weight_reps", "pending"],
  ["Adductor Machine", "Machine", "adductors", "weight_reps", "pending"],
  // arms
  ["Barbell Curl", "Barbell", "biceps", "weight_reps", "approved"],
  ["Dumbbell Curl", "Dumbbell", "biceps", "weight_reps", "approved"],
  ["Hammer Curl", "Dumbbell", "biceps", "weight_reps", "approved"],
  ["Preacher Curl", "Barbell", "biceps", "weight_reps", "pending"],
  ["Cable Curl", "Cable", "biceps", "weight_reps", "pending"],
  ["Rope Pushdown", "Cable", "triceps", "weight_reps", "approved"],
  ["Skull Crusher", "Barbell", "triceps", "weight_reps", "pending"],
  ["Overhead Rope Extension", "Cable", "triceps", "weight_reps", "pending"],
  ["Close Grip Bench Press", "Barbell", "triceps", "weight_reps", "approved"],
  ["Parallel Bar Dips", "Bodyweight", "triceps", "bodyweight_reps", "approved"],
  ["Weighted Dips", "Bodyweight", "triceps", "bodyweight_plus_weight", "approved"],
  // timed holds and core
  ["Plank", "Bodyweight", "abs", "isometric_hold", "approved"],
  ["Side Plank", "Bodyweight", "abs", "isometric_hold", "pending"],
  ["Weighted Plank", "Bodyweight", "abs", "weighted_duration", "approved"],
  ["Wall Sit", "Bodyweight", "quads", "isometric_hold", "pending"],
  ["Dead Hang", "Bodyweight", "forearms", "isometric_hold", "pending"],
  ["Hollow Hold", "Bodyweight", "abs", "isometric_hold", "pending"],
  ["Dead Bug", "Bodyweight", "abs", "bodyweight_reps", "pending"],
  ["Ab Wheel Rollout", "Bodyweight", "abs", "bodyweight_reps", "pending"],
  ["Pallof Press", "Cable", "abs", "weight_reps", "pending"],
  ["Hanging Leg Raise", "Bodyweight", "abs", "bodyweight_reps", "pending"],
  ["Cable Crunch", "Cable", "abs", "weight_reps", "pending"],
  // unilateral / carries / conditioning
  ["Single Arm Dumbbell Bench Press", "Dumbbell", "chest", "weight_reps", "pending"],
  ["Suitcase Carry", "Dumbbell", "obliques", "per_side_weight", "pending"],
  ["Farmer's Carry", "Strongman", "forearms", "weight_distance", "pending"],
  ["Treadmill Run", "Cardio Machine", "quads", "distance_duration", "pending"],
  ["Rowing Machine (Erg)", "Cardio Machine", "lats", "distance_duration", "pending"],
  ["Jump Rope", "Bodyweight", "calves", "duration", "pending"],
];

describe(`audited exercises (${AUDITED.length} commonly used movements)`, () => {
  it("covers at least 50 exercises across presses/flies, rows/pulldowns, hinges, curls, holds, unilateral and assisted work", () => {
    expect(AUDITED.length).toBeGreaterThanOrEqual(50);
  });

  it.each(AUDITED)("%s -> equipment %s, region %s, logged as %s, figure %s", (name, equipment, region, trackingType, media) => {
    const e = by(name);
    expect(e, `${name} exists`).toBeDefined();
    expect(e.equipment).toBe(equipment);
    expect(regionForExercise(e)).toBe(region);
    expect(e.trackingType).toBe(trackingType);
    expect(e.mediaStatus).toBe(media);
  });
});

describe("the specific audit findings", () => {
  it("Pec Deck describes bringing the handles together, not pressing", () => {
    const g = getExerciseGuidance(by("Pec Deck Machine"));
    expect(g.execution).toMatch(/together|arc|hug/i);
    expect(text(g)).not.toMatch(/press forward|lockout/i);
    expect(g.execution).toMatch(/fly, not a press/i);
  });

  it("Plank: first-session guidance is a hold time, even when a plan wrongly gave it a rep range", () => {
    const first = computeProgression({ workouts: [], exerciseName: "Plank", trackingType: by("Plank").trackingType, goal: "muscle_growth", planTarget: "8-12" });
    expect(first.text).toMatch(/hold/i);
    expect(first.text).not.toMatch(/weight|reps/i);
    const fromPlan = computeProgression({ workouts: [], exerciseName: "Plank", trackingType: "isometric_hold", planTarget: "30-45s" });
    expect(fromPlan.text).toMatch(/30-45s/);
  });

  it("Cable Lateral Raise: ONE rep/time target — the plan's 15-20 — is used everywhere, with no competing 8-12", () => {
    const ex = by("Cable Lateral Raise");
    const target = resolveTarget({ planTarget: "15-20", trackingType: ex.trackingType, goal: "muscle_growth" });
    expect(target).toMatchObject({ lo: 15, hi: 20, source: "plan" });
    const first = computeProgression({ workouts: [], exerciseName: ex.name, trackingType: ex.trackingType, goal: "muscle_growth", planTarget: "15-20", equipment: ex.equipment });
    expect(first.text).toMatch(/15-20/);
    expect(first.text).not.toMatch(/8-12/);
  });
});
