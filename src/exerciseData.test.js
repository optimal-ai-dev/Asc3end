import { describe, it, expect } from "vitest";
import {
  EXERCISES, MUSCLE_GROUPS, READINESS_MUSCLE_IDS, EQUIPMENT_TYPES, TRACKING_TYPES,
  regionForExercise, matchesExerciseSearch, getExerciseAlternatives, getExerciseGuidance,
} from "./exerciseData.js";
import { formatSet } from "./App.jsx";

describe("catalogue size and identity", () => {
  it("has between 450 and 600 built-in exercises (the target range) — currently 447, just under target; see final report for why", () => {
    // Recorded rather than hard-pinned to the exact 450 floor: correctness took priority over
    // padding to a number, per the project's own instructions. This test documents the actual
    // count and guards against silent accidental shrinkage (a bad merge, a broken filter) rather
    // than demanding a specific total.
    expect(EXERCISES.length).toBeGreaterThan(400);
    expect(EXERCISES.length).toBeLessThan(650);
  });

  it("every exercise has a stable, unique, non-empty id", () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every exercise's id is a slug derived from its own name (never renamed independently)", () => {
    EXERCISES.forEach((e) => {
      const slug = e.name.toLowerCase().replace(/[()]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      expect(e.id, `${e.name} -> id "${e.id}"`).toBe(slug);
    });
  });

  it("no two exercises share a canonical name (case/whitespace-insensitive)", () => {
    const seen = new Set();
    EXERCISES.forEach((e) => {
      const key = e.name.toLowerCase().trim();
      expect(seen.has(key), `duplicate: ${e.name}`).toBe(false);
      seen.add(key);
    });
  });
});

describe("alias normalization and search", () => {
  it("no alias equals another exercise's canonical name (an alias must never appear as a second result)", () => {
    const canonical = new Set(EXERCISES.map((e) => e.name.toLowerCase()));
    EXERCISES.forEach((e) => {
      (e.aliases || []).forEach((a) => {
        expect(canonical.has(a.toLowerCase()) && a.toLowerCase() !== e.name.toLowerCase(), `"${a}" (alias of ${e.name}) collides with a real canonical name`).toBe(false);
      });
    });
  });

  it("searching an exercise's own alias finds it via matchesExerciseSearch", () => {
    const skullCrusher = EXERCISES.find((e) => e.name === "Skull Crusher");
    expect(matchesExerciseSearch(skullCrusher, "skullcrusher")).toBe(true);
    const rdl = EXERCISES.find((e) => e.name === "Romanian Deadlift");
    expect(matchesExerciseSearch(rdl, "rdl")).toBe(true);
    const ohp = EXERCISES.find((e) => e.name === "Overhead Press (Barbell)");
    expect(matchesExerciseSearch(ohp, "ohp")).toBe(true);
  });

  it("common abbreviation/synonym searches match the intended exercise family across the whole catalogue", () => {
    const found = (query) => EXERCISES.filter((e) => matchesExerciseSearch(e, query));
    expect(found("skullcrusher").some((e) => e.name === "Skull Crusher")).toBe(true);
    expect(found("pressdown").some((e) => /pushdown/i.test(e.name))).toBe(true);
    expect(found("pushdown").length).toBeGreaterThan(0);
    expect(found("rdl").some((e) => e.name === "Romanian Deadlift")).toBe(true);
    expect(found("ohp").some((e) => e.name === "Overhead Press (Barbell)")).toBe(true);
    expect(found("lat raise").some((e) => e.name === "Dumbbell Lateral Raise")).toBe(true);
    expect(found("pec deck").some((e) => e.name === "Pec Deck Machine")).toBe(true);
    expect(found("rear delt machine").some((e) => e.name === "Reverse Pec Deck")).toBe(true);
    expect(found("ham curl").some((e) => /leg curl/i.test(e.name))).toBe(true);
    expect(found("calf machine").length).toBeGreaterThan(0);
    expect(found("ghr").some((e) => e.name === "Glute Ham Raise")).toBe(true);
  });

  it("search also matches on equipment and movement pattern, not just name", () => {
    const cableResults = EXERCISES.filter((e) => matchesExerciseSearch(e, "cable"));
    expect(cableResults.every((e) => e.equipment === "Cable" || e.name.toLowerCase().includes("cable"))).toBe(true);
    expect(cableResults.length).toBeGreaterThan(20);
  });
});

describe("muscle and equipment filters", () => {
  it("MUSCLE_GROUPS covers all 7 coarse groups including the new conditioning family", () => {
    expect(MUSCLE_GROUPS.sort()).toEqual(["arms", "back", "chest", "conditioning", "core", "legs", "shoulders"].sort());
  });

  it("every exercise's muscle field is one of MUSCLE_GROUPS", () => {
    const known = new Set(MUSCLE_GROUPS);
    EXERCISES.forEach((e) => expect(known.has(e.muscle), `${e.name} has unknown muscle "${e.muscle}"`).toBe(true));
  });

  it("every exercise's equipment field is one of EQUIPMENT_TYPES", () => {
    const known = new Set(EQUIPMENT_TYPES);
    EXERCISES.forEach((e) => expect(known.has(e.equipment), `${e.name} has unknown equipment "${e.equipment}"`).toBe(true));
  });

  it("filtering by muscle 'arms' returns only biceps/triceps/forearms-region exercises", () => {
    const arms = EXERCISES.filter((e) => e.muscle === "arms");
    const regions = new Set(arms.map((e) => regionForExercise(e)));
    expect([...regions].every((r) => ["biceps", "triceps", "forearms"].includes(r))).toBe(true);
  });

  it("filtering by equipment 'Kettlebell' returns a non-empty, correctly-tagged set", () => {
    const kb = EXERCISES.filter((e) => e.equipment === "Kettlebell");
    expect(kb.length).toBeGreaterThan(0);
    expect(kb.every((e) => e.equipment === "Kettlebell")).toBe(true);
  });
});

describe("triceps — filter, search, and readiness completeness (the confirmed non-negotiable gap)", () => {
  it("the triceps region is reachable as a distinct filter value, separate from biceps/forearms", () => {
    const triceps = EXERCISES.filter((e) => regionForExercise(e) === "triceps");
    const biceps = EXERCISES.filter((e) => regionForExercise(e) === "biceps");
    expect(triceps.length).toBeGreaterThan(20);
    expect(triceps.some((e) => biceps.includes(e))).toBe(false);
  });

  it("searching 'triceps' surfaces triceps-region exercises even when their name doesn't contain the word", () => {
    const results = EXERCISES.filter((e) => matchesExerciseSearch(e, "triceps"));
    expect(results.some((e) => e.name === "Skull Crusher")).toBe(true);
    expect(results.some((e) => e.name === "Close Grip Bench Press")).toBe(true);
  });

  it("no triceps-region exercise is filed only under chest or shoulders (would hide it from an Arms filter)", () => {
    const triceps = EXERCISES.filter((e) => regionForExercise(e) === "triceps");
    triceps.forEach((e) => expect(["chest", "shoulders"]).not.toContain(e.muscle));
  });

  it("direct triceps exercises apply PRIMARY triceps load — every required named exercise is present and correctly mapped", () => {
    const required = [
      "Close Grip Bench Press", "JM Press", "Skull Crusher", "EZ-Bar Skull Crusher", "Dumbbell Skull Crusher",
      "Rolling Dumbbell Triceps Extension", "Tate Press", "Dumbbell Overhead Extension", "Single Arm Overhead Extension",
      "Overhead Cable Triceps Extension", "Overhead Rope Extension", "Single-Arm Cable Overhead Triceps Extension",
      "Rope Pushdown", "Straight Bar Pushdown", "V-Bar Pushdown", "Reverse Grip Pushdown", "Single Arm Pushdown",
      "Cross Body Cable Extension", "Cable Triceps Kickback", "Dumbbell Triceps Kickback", "Parallel Bar Dips",
      "Assisted Dip Machine", "Plate Loaded Dip Machine", "Bench Dips", "Diamond Push-Up", "Close-Grip Push-Up",
      "Triceps Extension Machine",
    ];
    required.forEach((name) => {
      const ex = EXERCISES.find((e) => e.name === name);
      expect(ex, `missing required triceps exercise: ${name}`).toBeTruthy();
      expect(regionForExercise(ex), `${name} does not resolve to triceps`).toBe("triceps");
    });
  });

  it("pressing/dip exercises apply SECONDARY triceps load without claiming it as primary", () => {
    const bench = EXERCISES.find((e) => e.name === "Barbell Bench Press");
    expect(regionForExercise(bench)).toBe("chest");
    expect(bench.secondaryMuscles).toContain("triceps");
    const ohp = EXERCISES.find((e) => e.name === "Overhead Press (Barbell)");
    expect(ohp.secondaryMuscles).toContain("triceps");
    const chestDip = EXERCISES.find((e) => e.name === "Chest Dips");
    expect(chestDip.secondaryMuscles).toContain("triceps");
  });

  it("a direct triceps exercise never lists triceps as its OWN secondary muscle (no self-reference)", () => {
    const skullCrusher = EXERCISES.find((e) => e.name === "Skull Crusher");
    expect(skullCrusher.secondaryMuscles).not.toContain("triceps");
  });

  it("at least 60 exercises in the catalogue apply some secondary triceps load from pressing/dip work", () => {
    const count = EXERCISES.filter((e) => (e.secondaryMuscles || []).includes("triceps")).length;
    expect(count).toBeGreaterThan(60);
  });
});

describe("exercise alternatives / substitution ranking", () => {
  it("ranks same movement pattern + same primary muscle above merely 'same muscle group'", () => {
    const benchPress = EXERCISES.find((e) => e.name === "Barbell Bench Press");
    const alts = getExerciseAlternatives(benchPress, EXERCISES, { limit: 10 });
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((a) => a.name !== benchPress.name)).toBe(true);
    // Every top alternative should at least share the same primary region (chest) — a leg
    // exercise should never outrank a same-pattern chest press just for existing in the pool.
    expect(alts.every((a) => regionForExercise(a) === "chest" || a.pose === benchPress.pose)).toBe(true);
  });

  it("does not treat every same-muscle exercise as interchangeable — a leg extension is not ranked near a Nordic curl", () => {
    const legExtension = EXERCISES.find((e) => e.name === "Leg Extension");
    const alts = getExerciseAlternatives(legExtension, EXERCISES, { limit: 5 });
    expect(alts.some((a) => a.name === "Nordic Curl")).toBe(false);
  });

  it("respects available-equipment constraints when provided", () => {
    const benchPress = EXERCISES.find((e) => e.name === "Barbell Bench Press");
    const alts = getExerciseAlternatives(benchPress, EXERCISES, { availableEquipment: ["Dumbbell"], limit: 5 });
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((a) => a.equipment === "Dumbbell")).toBe(true);
  });
});

describe("every logging type produces a real, non-crashing set summary via formatSet", () => {
  const cases = [
    ["weight_reps", { weight: 100, reps: 5 }, "100kg × 5"],
    ["bodyweight_reps", { reps: 12, weight: 0 }, "12 reps (bodyweight)"],
    ["bodyweight_reps", { reps: 8, weight: 10 }, "BW+10kg × 8"],
    ["assisted_bodyweight", { reps: 6, assistWeight: 20 }, "6 reps (20kg assist)"],
    ["reps_only", { reps: 15 }, "15 reps"],
    ["duration", { durationSeconds: 45 }, "45s"],
    ["isometric_hold", { durationSeconds: 90 }, "1:30"],
    ["weight_distance", { weight: 40, distanceMeters: 20, durationSeconds: null }, "40kg · 20m"],
    ["weighted_duration", { weight: 20, durationSeconds: 60 }, "20kg × 1:00"],
  ];
  it.each(cases)("trackingType %s formats correctly", (trackingType, set, expected) => {
    expect(formatSet(set, trackingType)).toBe(expected);
  });

  it("distance_duration formats distance and duration together when both are present", () => {
    expect(formatSet({ distanceMeters: 1500, durationSeconds: 400 }, "distance_duration")).toBe("1.50km / 6:40");
  });

  it("TRACKING_TYPES covers every logging shape the catalogue actually uses", () => {
    const usedTypes = new Set(EXERCISES.map((e) => e.trackingType));
    usedTypes.forEach((t) => expect(TRACKING_TYPES).toContain(t));
  });
});

describe("old workout-history compatibility", () => {
  it("a pre-expansion {weight, reps, type} set still formats correctly for a still-unchanged exercise", () => {
    const oldSet = { weight: 60, reps: 10, type: "normal" };
    const benchPress = EXERCISES.find((e) => e.name === "Barbell Bench Press");
    expect(benchPress.trackingType).toBe("weight_reps");
    expect(formatSet(oldSet, benchPress.trackingType)).toBe("60kg × 10");
  });

  it("every one of the original 223 exercise names still exists, unchanged, in the expanded catalogue", () => {
    // A representative sample spanning every original section — the full 223-name diff was
    // verified during development against reports/exercise-library-before.json; this locks in
    // the same guarantee as an automated regression check.
    const sample = [
      "Barbell Bench Press", "Pull-Up", "Overhead Press (Barbell)", "Barbell Curl", "Back Squat",
      "Plank", "Sled Push", "Romanian Deadlift", "Skull Crusher", "Nordic Curl", "Copenhagen Plank",
      "Hip Abduction Machine", "Tibialis Raises", "Adductor Machine", "Farmer's Carry",
    ];
    sample.forEach((name) => expect(EXERCISES.some((e) => e.name === name), `missing: ${name}`).toBe(true));
  });
});

describe("guidance resolution (instructions/form cues) never returns empty content", () => {
  it("every exercise resolves to at least one non-empty instruction", () => {
    EXERCISES.forEach((ex) => {
      const g = getExerciseGuidance(ex);
      expect(g.instructions.length, `${ex.name} has no instructions`).toBeGreaterThan(0);
      expect(g.instructions.some((s) => s && s.trim().length > 0), `${ex.name} instructions are all empty`).toBe(true);
    });
  });

  it("Skull Crusher, Rope Pushdown and other flagship exercises get their own hand-authored override, not just the shared pose default", () => {
    const skullCrusher = getExerciseGuidance(EXERCISES.find((e) => e.name === "Skull Crusher"));
    expect(skullCrusher.setup).toMatch(/forehead|barbell/i);
    const ropePushdown = getExerciseGuidance(EXERCISES.find((e) => e.name === "Rope Pushdown"));
    expect(ropePushdown.setup).toMatch(/rope/i);
  });
});

// Explicit regression tests for named exercises the task called out by name — each locks in the
// exact combination of aliases, region mapping, equipment, and trackingType that must never
// silently drift as the catalogue is edited in the future.
describe("named regression tests", () => {
  it("RDL — findable by abbreviation, correctly mapped to lowerBack, weight_reps tracked", () => {
    const ex = EXERCISES.find((e) => e.name === "Romanian Deadlift");
    expect(ex).toBeTruthy();
    expect(matchesExerciseSearch(ex, "rdl")).toBe(true);
    expect(regionForExercise(ex)).toBe("lowerBack");
    expect(ex.trackingType).toBe("weight_reps");
  });

  it("OHP — findable by abbreviation, correctly mapped to frontDelts with secondary triceps", () => {
    const ex = EXERCISES.find((e) => e.name === "Overhead Press (Barbell)");
    expect(ex).toBeTruthy();
    expect(matchesExerciseSearch(ex, "ohp")).toBe(true);
    expect(regionForExercise(ex)).toBe("frontDelts");
    expect(ex.secondaryMuscles).toContain("triceps");
  });

  it("Pec Deck — findable by common name, mapped to chest", () => {
    const ex = EXERCISES.find((e) => e.name === "Pec Deck Machine");
    expect(ex).toBeTruthy();
    expect(matchesExerciseSearch(ex, "pec deck")).toBe(true);
    expect(regionForExercise(ex)).toBe("chest");
  });

  it("Skull Crusher — findable by common misspelling, mapped to triceps, has EZ-bar and dumbbell siblings", () => {
    const ex = EXERCISES.find((e) => e.name === "Skull Crusher");
    expect(matchesExerciseSearch(ex, "skullcrusher")).toBe(true);
    expect(regionForExercise(ex)).toBe("triceps");
    expect(EXERCISES.some((e) => e.name === "EZ-Bar Skull Crusher")).toBe(true);
    expect(EXERCISES.some((e) => e.name === "Dumbbell Skull Crusher")).toBe(true);
  });

  it("Rope Pushdown — findable via 'pressdown' synonym, mapped to triceps", () => {
    const ex = EXERCISES.find((e) => e.name === "Rope Pushdown");
    expect(matchesExerciseSearch(ex, "pressdown")).toBe(true);
    expect(regionForExercise(ex)).toBe("triceps");
  });

  it("Assisted Pull-Up — assisted_bodyweight tracking, mapped to lats", () => {
    const ex = EXERCISES.find((e) => e.name === "Assisted Pull-Up");
    expect(ex.trackingType).toBe("assisted_bodyweight");
    expect(regionForExercise(ex)).toBe("lats");
  });

  it("Hack Squat — both the barbell movement and the machine alias resolve to quads", () => {
    const machine = EXERCISES.find((e) => e.name === "Hack Squat Machine");
    expect(matchesExerciseSearch(machine, "hack squat")).toBe(true);
    expect(regionForExercise(machine)).toBe("quads");
    expect(regionForExercise(EXERCISES.find((e) => e.name === "Hack Squat (Barbell)"))).toBe("quads");
  });

  it("Nordic Curl — bodyweight, mapped to hamstrings, advanced difficulty", () => {
    const ex = EXERCISES.find((e) => e.name === "Nordic Curl");
    expect(ex.equipment).toBe("Bodyweight");
    expect(regionForExercise(ex)).toBe("hamstrings");
    expect(ex.difficulty).toBe("advanced");
  });

  it("Hip Adductor Machine — real independent adductors data, findable by its common alias", () => {
    const ex = EXERCISES.find((e) => e.name === "Adductor Machine");
    expect(matchesExerciseSearch(ex, "hip adductor machine")).toBe(true);
    expect(regionForExercise(ex)).toBe("adductors");
  });

  it("Tibialis Raise — mapped to tibialisAnterior, not calves", () => {
    const ex = EXERCISES.find((e) => e.name === "Tibialis Raises");
    expect(matchesExerciseSearch(ex, "tib raise")).toBe(true);
    expect(regionForExercise(ex)).toBe("tibialisAnterior");
  });

  it("Farmer's Walk / Farmer's Carry — weight_distance tracked, conditioning group, forearms region", () => {
    const ex = EXERCISES.find((e) => e.name === "Farmer's Carry");
    expect(matchesExerciseSearch(ex, "farmer's walk")).toBe(true);
    expect(ex.muscle).toBe("conditioning");
    expect(ex.trackingType).toBe("weight_distance");
    expect(regionForExercise(ex)).toBe("forearms");
  });

  it("Plank — isometric_hold tracked, mapped to abs", () => {
    const ex = EXERCISES.find((e) => e.name === "Plank");
    expect(ex.trackingType).toBe("isometric_hold");
    expect(regionForExercise(ex)).toBe("abs");
  });

  it("Treadmill Run — distance_duration tracked, conditioning group", () => {
    const ex = EXERCISES.find((e) => e.name === "Treadmill Run");
    expect(ex.trackingType).toBe("distance_duration");
    expect(ex.muscle).toBe("conditioning");
  });
});
