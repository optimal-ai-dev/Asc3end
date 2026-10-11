import { describe, it, expect } from "vitest";
import { computeReadiness, setWorkloadUnits, recoveryHoursFor, READINESS_EXPLAINER } from "./readiness";

const NOW = Date.UTC(2026, 9, 8, 14, 30, 0); // 01:30, 9 Oct, Sydney
const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();
const session = (h, exercises, extra = {}) => ({ id: `w${h}-${Math.random()}`, date: "2026-10-08", completedAt: hoursAgo(h), startedAt: NOW - h * 3600000, exercises, ...extra });
const bench = (n, type = "normal", weight = 80) => ({ name: "Barbell Bench Press", trackingType: "weight_reps", sets: Array.from({ length: n }, () => ({ weight, reps: 8, type })) });
const plank = (seconds) => ({ name: "Plank", trackingType: "isometric_hold", sets: [{ durationSeconds: seconds, type: "normal" }] });
const opts = { now: NOW, timeZone: "Australia/Sydney" };
const levelsOf = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.level]));

describe("the audit's case: a light bench warm-up plus a 30-second plank (audit finding 9)", () => {
  const r = computeReadiness([session(1, [bench(1, "warmup", 20), plank(30)])], [], opts);

  it("no region is labelled Fatigued", () => {
    expect(Object.values(levelsOf(r))).not.toContain("fatigued");
    expect(Object.values(levelsOf(r))).not.toContain("partial");
  });

  it("the warm-up contributes nothing at all, so chest has no evidence (insufficient data), not a reading", () => {
    expect(r.chest.level).toBe("unknown");
  });

  it("the plank is a light, neutral 'recently trained' for abs — and says so", () => {
    expect(r.abs.level).toBe("recent");
    expect(r.abs.lastSessionSets).toBe(1);
  });
});

describe("workload, not mere presence, decides the strong claims", () => {
  it("one working set is 'recently trained'; only a substantial session reads 'fatigued'", () => {
    expect(computeReadiness([session(1, [bench(1)])], [], opts).chest.level).toBe("recent");
    expect(computeReadiness([session(1, [bench(3)])], [], opts).chest.level).toBe("recent");
    expect(computeReadiness([session(1, [bench(5)])], [], opts).chest.level).toBe("fatigued");
  });

  it("a substantial session moves through fatigued -> partial -> ready as time passes", () => {
    const at = (h) => computeReadiness([session(h, [bench(6)])], [], opts).chest.level;
    expect(at(2)).toBe("fatigued");
    expect(at(36)).toBe("partial");
    expect(at(80)).toBe("ready");
  });

  it("exercises added but never logged, and warm-up-only exercises, never mark a region as trained", () => {
    const r = computeReadiness([session(1, [{ name: "Barbell Bench Press", sets: [] }, bench(2, "warmup")])], [], opts);
    expect(r.chest.level).toBe("unknown");
    expect(r.triceps.level).toBe("unknown"); // secondary regions of a skipped exercise stay untouched too
  });

  it("deload sets count at half weight", () => {
    expect(setWorkloadUnits({ weight: 50, reps: 8, type: "deload" }, "weight_reps")).toBe(0.5);
    expect(setWorkloadUnits({ weight: 50, reps: 8, type: "warmup" }, "weight_reps")).toBe(0);
    expect(setWorkloadUnits({ weight: 50, reps: 8, type: "drop" }, "weight_reps")).toBe(1);
  });

  it("timed holds scale with duration but never exceed one working set", () => {
    expect(setWorkloadUnits({ durationSeconds: 30 }, "isometric_hold")).toBeCloseTo(30 / 45, 5);
    expect(setWorkloadUnits({ durationSeconds: 300 }, "isometric_hold")).toBe(1);
    expect(setWorkloadUnits({ durationSeconds: 5 }, "isometric_hold")).toBe(0.25);
  });

  it("secondary muscles get a fraction of the load: heavy benching registers on triceps, but lightly", () => {
    const r = computeReadiness([session(1, [bench(5)])], [], opts);
    expect(r.triceps.via).toBe("secondary");
    expect(r.triceps.lastSessionUnits).toBeCloseTo(5 * 0.4, 5);
    expect(r.triceps.level).toBe("recent");
    expect(r.triceps.recentSets).toBe(5 * 0 + 0); // secondary work never inflates direct set counts
  });

  it("carry-over from other recent sessions raises the estimate", () => {
    const heavyTwice = computeReadiness([session(30, [bench(4)]), session(2, [bench(2)])], [], opts);
    // the latest session alone is only 2 units (recent); with half of the earlier 4 it becomes substantial
    expect(heavyTwice.chest.workloadUnits).toBeCloseTo(4, 5);
    expect(heavyTwice.chest.level).toBe("fatigued");
  });
});

describe("honesty about evidence", () => {
  it("nothing logged -> insufficient data for every region, no fabricated percentage", () => {
    const r = computeReadiness([], [], opts);
    expect(new Set(Object.values(levelsOf(r)))).toEqual(new Set(["unknown"]));
    expect(Object.values(r).every((x) => x.recoveryPercent === null)).toBe(true);
  });

  it("a legacy date-only workout (no real timestamp) can never claim fatigue", () => {
    const legacy = { id: "old", date: "2026-10-09", exercises: [bench(8)] };
    const r = computeReadiness([legacy], [], opts);
    expect(r.chest.level).toBe("recent");
    expect(r.chest.precision).toBe("date");
  });

  it("time since uses the real instant: 01:30 on the 9th in Sydney is not 'yesterday' because the UTC date is the 8th", () => {
    const w = { id: "a", date: "2026-10-09", timeZone: "Australia/Sydney", startedAt: NOW - 3600000, completedAt: hoursAgo(1), exercises: [bench(6)] };
    const r = computeReadiness([w], [], opts);
    expect(r.chest.hours).toBeCloseTo(1, 1);
    expect(r.chest.level).toBe("fatigued");
  });

  it("recovery time scales with workload and is capped", () => {
    expect(recoveryHoursFor(1)).toBe(12);
    expect(recoveryHoursFor(4)).toBe(40);
    expect(recoveryHoursFor(100)).toBe(72);
  });

  it("states its limits in plain language", () => {
    expect(READINESS_EXPLAINER).toMatch(/warm-up/i);
    expect(READINESS_EXPLAINER).toMatch(/sleep|soreness/i);
    expect(READINESS_EXPLAINER).toMatch(/isn.t a medical/i);
  });

  it("malformed workouts and unknown exercises are ignored, not crashed on", () => {
    expect(() => computeReadiness([null, {}, { exercises: null }, { date: "x", exercises: [{ name: "Nope", sets: [{}] }] }], [], opts)).not.toThrow();
  });
});
