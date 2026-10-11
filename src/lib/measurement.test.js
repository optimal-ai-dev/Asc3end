import { describe, it, expect } from "vitest";
import {
  MEASUREMENT_TYPES, validateSetInput, isSetComplete, formatSet, setVolume, setEstimated1RM, estimate1RM,
  effectiveTrackingType, inferTypeFromShape, bestSet, compareSets, setKind, isBaselineEligible, isPrEligible, isWorkingSet,
  summarizeExercise, exerciseVolume, parseNumericInput, weightBasisLabel,
} from "./measurement";
import { EXERCISES, TRACKING_TYPES } from "../exerciseData";
import { computeGamification, workoutVolumeKg, hasValidSets, workingSets } from "./workoutMath";

describe("the measurement model covers every type the catalogue uses", () => {
  it("MEASUREMENT_TYPES == TRACKING_TYPES and every catalogue exercise resolves", () => {
    expect([...MEASUREMENT_TYPES].sort()).toEqual([...TRACKING_TYPES].sort());
    for (const ex of EXERCISES) expect(MEASUREMENT_TYPES).toContain(ex.trackingType);
  });
});

// A representative valid input and the exact persisted shape, for every supported type.
const ROUND_TRIPS = [
  ["weight_reps", { weight: "82.5", reps: "8" }, { weight: 82.5, reps: 8 }, "82.5kg × 8"],
  ["per_side_weight", { weight: "20", reps: "10" }, { weight: 20, reps: 10 }, "20kg × 10"],
  ["bodyweight_plus_weight", { reps: "8", weight: "10" }, { reps: 8, weight: 10 }, "BW+10kg × 8"],
  ["bodyweight_plus_weight", { reps: "8" }, { reps: 8, weight: 0 }, "8 reps (bodyweight)"],
  ["bodyweight_reps", { reps: "12", weight: "" }, { reps: 12, weight: 0 }, "12 reps (bodyweight)"],
  ["assisted_bodyweight", { reps: "6", assistWeight: "25" }, { reps: 6, assistWeight: 25 }, "6 reps (25kg assist)"],
  ["assisted_bodyweight", { reps: "6" }, { reps: 6, assistWeight: 0 }, "6 reps (0kg assist)"],
  ["reps_only", { reps: "15" }, { reps: 15 }, "15 reps"],
  ["duration", { durationSeconds: "45" }, { durationSeconds: 45 }, "45s"],
  ["isometric_hold", { durationSeconds: "30" }, { durationSeconds: 30 }, "30s"],
  ["weighted_duration", { weight: "20", durationSeconds: "60" }, { weight: 20, durationSeconds: 60 }, "20kg × 1:00"],
  ["distance_duration", { distanceMeters: "5000", durationSeconds: "1500" }, { distanceMeters: 5000, durationSeconds: 1500 }, "5.00km / 25:00"],
  ["distance_duration", { durationSeconds: "600" }, { distanceMeters: null, durationSeconds: 600 }, "10:00"],
  ["weight_distance", { weight: "40", distanceMeters: "20" }, { weight: 40, distanceMeters: 20, durationSeconds: null }, "40kg · 20m"],
];

describe("complete round trip for every measurement type: input -> persisted shape -> JSON -> display", () => {
  it.each(ROUND_TRIPS)("%s %j", (type, input, stored, display) => {
    const result = validateSetInput(type, input);
    expect(result.errors).toEqual({});
    expect(result.ok).toBe(true);
    expect(result.set).toEqual(stored);
    const afterRefresh = JSON.parse(JSON.stringify(result.set)); // saved and reloaded
    expect(isSetComplete(afterRefresh, type)).toBe(true);
    expect(formatSet(afterRefresh, type)).toBe(display);
    expect(formatSet(afterRefresh, type)).not.toMatch(/NaN|undefined|null|Infinity/);
  });

  it("covers every supported type", () => {
    const covered = new Set(ROUND_TRIPS.map((r) => r[0]));
    for (const t of MEASUREMENT_TYPES) expect(covered).toContain(t);
  });
});

describe("input validation follows each field's meaning", () => {
  const bad = (type, input) => validateSetInput(type, input);

  it("rejects negatives, zero where zero is meaningless, NaN-ish text and exponent notation", () => {
    expect(bad("weight_reps", { weight: "-5", reps: "8" }).errors.weight).toMatch(/negative/);
    expect(bad("weight_reps", { weight: "0", reps: "8" }).errors.weight).toMatch(/above 0/);
    expect(bad("weight_reps", { weight: "80", reps: "0" }).errors.reps).toMatch(/at least 1/);
    expect(bad("weight_reps", { weight: "abc", reps: "8" }).errors.weight).toMatch(/number/);
    expect(bad("weight_reps", { weight: "1e3", reps: "8" }).errors.weight).toMatch(/number/);
    expect(bad("weight_reps", { weight: "80", reps: "NaN" }).errors.reps).toMatch(/number/);
    expect(bad("weight_reps", { weight: "80kg", reps: "8" }).errors.weight).toMatch(/number/);
  });

  it("reps and seconds must be whole numbers; weight may be fractional to 2 places", () => {
    expect(bad("weight_reps", { weight: "80", reps: "8.5" }).errors.reps).toMatch(/whole/);
    expect(bad("isometric_hold", { durationSeconds: "30.5" }).errors.durationSeconds).toMatch(/whole/);
    expect(validateSetInput("weight_reps", { weight: "82.25", reps: "8" }).ok).toBe(true);
    expect(bad("weight_reps", { weight: "82.255", reps: "8" }).errors.weight).toMatch(/decimal/);
    expect(validateSetInput("weight_reps", { weight: "82,5", reps: "8" }).set.weight).toBe(82.5);
  });

  it("required fields are required; blank optional fields default to a real 0", () => {
    expect(bad("weight_reps", {}).errors).toEqual({ weight: "Weight is required.", reps: "Reps is required." });
    expect(bad("isometric_hold", { durationSeconds: "" }).errors.durationSeconds).toMatch(/required/);
    expect(validateSetInput("bodyweight_reps", { reps: "5" }).set).toEqual({ reps: 5, weight: 0 });
    expect(bad("bodyweight_reps", { reps: "5", weight: "-1" }).errors.weight).toMatch(/negative/);
  });

  it("a typed zero for an OPTIONAL field is legitimate (zero added weight / zero assistance is not 'missing')", () => {
    expect(validateSetInput("bodyweight_reps", { reps: "5", weight: "0" }).set).toEqual({ reps: 5, weight: 0 });
    expect(validateSetInput("assisted_bodyweight", { reps: "5", assistWeight: "0" }).set).toEqual({ reps: 5, assistWeight: 0 });
    expect(isSetComplete({ reps: 5, weight: 0 }, "bodyweight_reps")).toBe(true);
    expect(isSetComplete({ reps: 5, assistWeight: 0 }, "assisted_bodyweight")).toBe(true);
  });

  it("distance/duration needs at least one of the two; weight_distance needs weight AND one of them", () => {
    expect(bad("distance_duration", {}).ok).toBe(false);
    expect(bad("distance_duration", { distanceMeters: "0", durationSeconds: "0" }).ok).toBe(false);
    expect(bad("weight_distance", { weight: "40" }).ok).toBe(false);
    expect(bad("weight_distance", { distanceMeters: "20" }).errors.weight).toMatch(/required/);
  });

  it("caps absurd values", () => {
    expect(bad("weight_reps", { weight: "99999", reps: "8" }).errors.weight).toMatch(/too large/);
    expect(bad("isometric_hold", { durationSeconds: "999999" }).errors.durationSeconds).toMatch(/too large/);
  });

  it("RPE and RIR are validated when given and ignored when blank", () => {
    expect(validateSetInput("weight_reps", { weight: "80", reps: "8", rpe: "8.5", rir: "2" }).set).toMatchObject({ rpe: 8.5, rir: 2 });
    expect(bad("weight_reps", { weight: "80", reps: "8", rpe: "11" }).errors.rpe).toMatch(/too large/);
    expect(bad("weight_reps", { weight: "80", reps: "8", rpe: "8.3" }).errors.rpe).toMatch(/half/);
    expect(bad("weight_reps", { weight: "80", reps: "8", rir: "1.5" }).errors.rir).toMatch(/whole/);
    expect(validateSetInput("weight_reps", { weight: "80", reps: "8", rpe: "" }).set).toEqual({ weight: 80, reps: 8 });
  });

  it("parseNumericInput only accepts plain decimals", () => {
    expect(parseNumericInput(" 12 ")).toBe(12);
    expect(parseNumericInput(12)).toBe(12);
    for (const x of ["", "  ", "0x10", "1,000.5", "Infinity", "--3", ".", null, undefined, {}]) expect(Number.isNaN(parseNumericInput(x))).toBe(true);
  });
});

describe("duration-only exercises never grow weight/reps/1RM (audit finding 2: Plank)", () => {
  const plank = { name: "Plank", trackingType: "isometric_hold", sets: [{ durationSeconds: 30, type: "normal" }] };

  it("no volume, no 1RM, no kg anywhere", () => {
    expect(setVolume(plank.sets[0], "isometric_hold")).toBeNull();
    expect(setEstimated1RM(plank.sets[0], "isometric_hold")).toBeNull();
    expect(formatSet(plank.sets[0], "isometric_hold")).toBe("30s");
    expect(summarizeExercise(plank, "isometric_hold")).toBe("1 set · best 30s");
    expect(exerciseVolume(plank, "isometric_hold")).toBe(0);
  });

  it("workout tonnage ignores it instead of producing NaN", () => {
    const w = { exercises: [plank, { name: "Barbell Bench Press", sets: [{ weight: 80, reps: 8 }] }] };
    expect(workoutVolumeKg(w)).toBe(640);
    expect(Number.isNaN(computeGamification([w], 0).totalVolume)).toBe(false);
  });

  it("editing 30s -> 45s keeps it a duration record: the best set is the 45s one", () => {
    const edited = { ...plank, sets: [{ durationSeconds: 45, type: "normal" }] };
    expect(bestSet(edited.sets, "isometric_hold")).toEqual({ durationSeconds: 45, type: "normal" });
    expect(compareSets({ durationSeconds: 45 }, { durationSeconds: 30 }, "isometric_hold")).toBeGreaterThan(0);
  });

  it("estimate1RM refuses meaningless inputs", () => {
    expect(estimate1RM(undefined, 5)).toBeNull();
    expect(estimate1RM(100, undefined)).toBeNull();
    expect(estimate1RM(0, 5)).toBeNull();
    expect(estimate1RM(100, 100)).toBeNull();
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 10)).toBeCloseTo(133.33, 1);
  });
});

describe("legacy records are never silently reinterpreted", () => {
  it("an old {weight, reps} record for an exercise since re-typed as a hold still reads as weight x reps", () => {
    const legacy = { name: "Plank", sets: [{ weight: 10, reps: 5, type: "normal" }] };
    expect(effectiveTrackingType(legacy, "isometric_hold")).toBe("weight_reps");
    expect(formatSet(legacy.sets[0], effectiveTrackingType(legacy, "isometric_hold"))).toBe("10kg × 5");
  });

  it("a stored trackingType on the entry wins over whatever the catalogue says today", () => {
    expect(effectiveTrackingType({ name: "X", trackingType: "duration", sets: [{ durationSeconds: 20 }] }, "weight_reps")).toBe("duration");
  });

  it("when the sets match the catalogue type, the catalogue type is used", () => {
    expect(effectiveTrackingType({ name: "Plank", sets: [{ durationSeconds: 30 }] }, "isometric_hold")).toBe("isometric_hold");
  });

  it("shape inference covers every stored shape and never throws on garbage", () => {
    expect(inferTypeFromShape({ weight: 50, reps: 5 })).toBe("weight_reps");
    expect(inferTypeFromShape({ durationSeconds: 30 })).toBe("duration");
    expect(inferTypeFromShape({ reps: 5, assistWeight: 10 })).toBe("assisted_bodyweight");
    expect(inferTypeFromShape({ distanceMeters: 100 })).toBe("distance_duration");
    expect(inferTypeFromShape(null)).toBe("weight_reps");
    expect(formatSet(null)).toBe("—");
    expect(formatSet({}, "weight_reps")).toBe("—");
    expect(formatSet({ weight: NaN, reps: 5 })).toBe("—");
  });

  it("malformed stored sets are not 'complete' and so never reach totals", () => {
    const entry = { name: "Squat", sets: [{ weight: NaN, reps: 8 }, { weight: 60 }, null, "x", { weight: 60, reps: 8 }] };
    expect(hasValidSets(entry)).toBe(true);
    expect(workingSets(entry)).toEqual([{ weight: 60, reps: 8 }]);
  });
});

describe("set kinds", () => {
  it("classifies sets; unknown/legacy types are working sets", () => {
    expect(setKind({ type: "warmup" })).toBe("warmup");
    expect(setKind({ type: "working" })).toBe("normal");
    expect(setKind({})).toBe("normal");
    expect(setKind(null)).toBe("normal");
    expect(isBaselineEligible({ type: "warmup" })).toBe(false);
    expect(isBaselineEligible({ type: "drop" })).toBe(false);
    expect(isBaselineEligible({ type: "deload" })).toBe(false);
    expect(isBaselineEligible({ type: "failure" })).toBe(true);
    expect(isPrEligible({ type: "drop" })).toBe(false);
    expect(isWorkingSet({ type: "warmup" })).toBe(false);
    expect(isWorkingSet({ type: "deload" })).toBe(true);
  });
});

describe("unit semantics are labelled", () => {
  it("states per-dumbbell vs total vs assistance", () => {
    expect(weightBasisLabel({ equipment: "Dumbbell" })).toBe("kg (each dumbbell)");
    expect(weightBasisLabel({ equipment: "Barbell" })).toBe("kg");
    expect(weightBasisLabel({ equipment: "Dumbbell", laterality: "unilateral" })).toBe("kg (each side)");
    expect(weightBasisLabel({ trackingType: "assisted_bodyweight" })).toBe("assistance (kg)");
    expect(weightBasisLabel({ trackingType: "bodyweight_reps" })).toBe("added kg");
  });
  it("formats with the lb unit when asked", () => {
    expect(formatSet({ weight: 185, reps: 5 }, "weight_reps", { unit: "lb" })).toBe("185lb × 5");
  });
});
