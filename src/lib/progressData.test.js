import { describe, it, expect } from "vitest";
import {
  exerciseNamesWithData, exerciseRecords, strengthSeries, metricsForType, prTimeline, historicalPrEvents, bestWeightFor,
  liftChange, muscleVolumeInRange, weeklyMuscleVolume, consistencyGrid, monthRange, shiftMonthKey, sparklineValues, typeOfExercise,
} from "./progressData";

let id = 1;
const wk = (date, exercises) => ({ id: `w${id++}`, date, exercises });
const plankEntry = (seconds, extra = {}) => ({ name: "Plank", trackingType: "isometric_hold", sets: [{ durationSeconds: seconds, type: "normal" }], ...extra });
const flat = (v) => JSON.stringify(v);

describe("Plank end to end at the data layer (audit finding 2)", () => {
  it("30s logged -> a duration record; no kg, reps, 1RM or NaN appears anywhere", () => {
    const workouts = [wk("2026-10-09", [plankEntry(30)])];
    const r = exerciseRecords(workouts, "Plank");
    expect(r.type).toBe("isometric_hold");
    expect(r.records).toHaveLength(1);
    expect(r.records[0]).toMatchObject({ label: "Longest hold", text: "30s" });
    expect(r.headline).toBe("30s");
    expect(flat(r)).not.toMatch(/NaN|undefined|kg|1RM|1rm|reps/i);
    const s = strengthSeries(workouts, "Plank");
    expect(s.metrics.map((m) => m.key)).toEqual(["seconds"]);
    expect(flat(s)).not.toMatch(/NaN|undefined|1rm/);
    expect(metricsForType("isometric_hold").some((m) => m.key === "1rm" || m.unit === "kg")).toBe(false);
  });

  it("after a refresh (JSON round trip) and an edit to 45s, the record is the 45s duration", () => {
    let workouts = [wk("2026-10-09", [plankEntry(30)])];
    workouts = JSON.parse(JSON.stringify(workouts)); // saved, page refreshed, loaded back
    expect(exerciseRecords(workouts, "Plank").headline).toBe("30s");
    workouts = workouts.map((w) => ({ ...w, exercises: [{ ...w.exercises[0], sets: [{ durationSeconds: 45, type: "normal" }] }] }));
    const r = exerciseRecords(workouts, "Plank");
    expect(r.records[0]).toMatchObject({ label: "Longest hold", text: "45s", date: "2026-10-09" });
    expect(prTimeline(workouts)[0]).toMatchObject({ name: "Plank", detail: "45s", kind: "duration", label: "New duration PR" });
  });

  it("a legacy-shaped plank (older record with no stored type, duration-only sets) is still a duration exercise", () => {
    const workouts = [wk("2026-10-01", [{ name: "Plank", sets: [{ durationSeconds: 60 }] }])];
    expect(exerciseRecords(workouts, "Plank").headline).toBe("1:00");
  });

  it("a plank with NO valid sets produces no record at all (not a NaN record)", () => {
    const workouts = [wk("2026-10-01", [{ name: "Plank", trackingType: "isometric_hold", sets: [{}, { durationSeconds: NaN }] }])];
    expect(exerciseNamesWithData(workouts)).toEqual([]);
    expect(exerciseRecords(workouts, "Plank")).toMatchObject({ records: [], headline: null, hasData: false });
  });
});

describe("weight x reps records and series", () => {
  const workouts = [
    wk("2026-09-01", [{ name: "Barbell Bench Press", sets: [{ weight: 100, reps: 3, type: "warmup" }, { weight: 80, reps: 8 }, { weight: 80, reps: 6 }] }]),
    wk("2026-09-08", [{ name: "Barbell Bench Press", sets: [{ weight: 85, reps: 5 }, { weight: 70, reps: 12 }] }]),
  ];
  it("warm-ups never become the heaviest record", () => {
    const r = exerciseRecords(workouts, "Barbell Bench Press");
    expect(r.records[0]).toMatchObject({ label: "Heaviest", text: "85kg × 5" });
    expect(r.records.find((x) => x.key === "reps").text).toBe("70kg × 12");
    expect(r.records.find((x) => x.key === "e1rm").text).toBe("101kg"); // 80kg x 8; the 100kg x 3 warm-up (110) is excluded
    expect(r.records.find((x) => x.key === "volume")).toBeDefined();
  });
  it("series gives weight, 1RM and volume per session from working sets only", () => {
    const s = strengthSeries(workouts, "Barbell Bench Press");
    expect(s.points[0]).toMatchObject({ date: "2026-09-01", weight: 80, volume: 80 * 8 + 80 * 6 });
    expect(s.points[1].weight).toBe(85);
    expect(s.metrics.map((m) => m.key)).toEqual(["weight", "1rm", "volume"]);
  });
  it("bestWeightFor and liftChange ignore warm-ups", () => {
    expect(bestWeightFor(workouts, "Barbell Bench Press")).toBe(85);
    expect(liftChange(workouts, "Barbell Bench Press")).toBe(5);
  });
  it("sparkline values come from the primary metric", () => {
    expect(sparklineValues(workouts, "Barbell Bench Press")).toEqual([80, 85]);
  });
});

describe("other measurement types get their own records", () => {
  it("assisted: less assistance is the PR", () => {
    const workouts = [
      wk("2026-09-01", [{ name: "Assisted Pull-Up", trackingType: "assisted_bodyweight", sets: [{ reps: 8, assistWeight: 30 }] }]),
      wk("2026-09-08", [{ name: "Assisted Pull-Up", trackingType: "assisted_bodyweight", sets: [{ reps: 6, assistWeight: 25 }] }]),
    ];
    const r = exerciseRecords(workouts, "Assisted Pull-Up");
    expect(r.records[0]).toMatchObject({ label: "Least assistance", text: "6 reps (25kg assist)" });
    expect(strengthSeries(workouts, "Assisted Pull-Up").points.map((p) => p.assist)).toEqual([30, 25]);
  });
  it("bodyweight reps: most reps, with zero added weight handled", () => {
    const workouts = [wk("2026-09-01", [{ name: "Pull-Up", trackingType: "bodyweight_reps", sets: [{ reps: 8, weight: 0 }, { reps: 10, weight: 0 }] }])];
    const r = exerciseRecords(workouts, "Pull-Up");
    expect(r.headline).toBe("10 reps (bodyweight)");
    expect(flat(r)).not.toMatch(/1RM|NaN/i);
  });
  it("distance: longest distance and time", () => {
    const workouts = [wk("2026-09-01", [{ name: "Treadmill Run", trackingType: "distance_duration", sets: [{ distanceMeters: 5000, durationSeconds: 1500 }, { distanceMeters: 3000, durationSeconds: 1900 }] }])];
    const r = exerciseRecords(workouts, "Treadmill Run");
    expect(r.records[0].text).toBe("5.00km / 25:00");
    expect(r.records.map((x) => x.key)).toContain("duration");
  });
  it("type of exercise follows the latest session with data", () => {
    expect(typeOfExercise([wk("2026-09-01", [plankEntry(30)])], "Plank")).toBe("isometric_hold");
  });
});

describe("PR timeline / historical events", () => {
  it("formats each event in its own unit and ignores warm-up sets", () => {
    const workouts = [
      wk("2026-09-01", [{ name: "Barbell Bench Press", sets: [{ weight: 100, reps: 1, type: "warmup" }, { weight: 80, reps: 8 }] }, plankEntry(30)]),
      wk("2026-09-08", [{ name: "Barbell Bench Press", sets: [{ weight: 82.5, reps: 8 }] }, plankEntry(45)]),
    ];
    const tl = prTimeline(workouts);
    expect(tl.map((e) => `${e.name}:${e.detail}`)).toContain("Plank:45s");
    expect(tl.map((e) => `${e.name}:${e.detail}`)).toContain("Barbell Bench Press:82.5kg × 8");
    expect(tl.map((e) => e.detail).join(" ")).not.toMatch(/NaN|undefined/);
    expect(historicalPrEvents(workouts).filter((e) => e.name === "Barbell Bench Press").map((e) => e.detail)).toEqual(["80kg × 8", "82.5kg × 8"]);
  });
});

describe("volume per muscle and the consistency grid", () => {
  const workouts = [
    wk("2026-10-08", [
      { name: "Barbell Bench Press", sets: [{ weight: 20, reps: 5, type: "warmup" }, { weight: 80, reps: 10 }] },
      plankEntry(30),
    ]),
  ];
  it("counts working sets only and gives a plank no tonnage", () => {
    const v = muscleVolumeInRange(workouts, [], "2026-10-01", "2026-10-31");
    expect(v.find((m) => m.muscle === "chest").volume).toBe(800);
    expect(v.find((m) => m.muscle === "core").volume).toBe(0);
  });
  it("weekly window is the last 7 LOCAL days", () => {
    const now = Date.UTC(2026, 9, 8, 14, 30, 0); // 9 Oct 01:30 in Sydney
    expect(weeklyMuscleVolume(workouts, [], { now, timeZone: "Australia/Sydney" }).find((m) => m.muscle === "chest").volume).toBe(800);
    expect(weeklyMuscleVolume(workouts, [], { now: Date.UTC(2026, 9, 20), timeZone: "Australia/Sydney" }).find((m) => m.muscle === "chest").volume).toBe(0);
  });
  it("grid is Sunday-aligned, ends on a Saturday, marks future days and counts working sets", () => {
    const now = Date.UTC(2026, 9, 8, 14, 30, 0);
    const grid = consistencyGrid(workouts, 2, { now, timeZone: "Australia/Sydney" });
    expect(grid).toHaveLength(14);
    expect(grid[0].date).toBe("2026-09-27");
    expect(grid[13].date).toBe("2026-10-10");
    expect(grid.find((d) => d.date === "2026-10-08")).toMatchObject({ count: 2, future: false });
    expect(grid.find((d) => d.date === "2026-10-10").future).toBe(true);
    expect(grid.find((d) => d.date === "2026-10-09").future).toBe(false); // "today" in Sydney
  });
});

describe("month helpers use no UTC date slicing", () => {
  it("monthRange covers exactly the calendar month and flags the current one in the viewer's timezone", () => {
    const r = monthRange("2026-02", { now: Date.UTC(2026, 1, 28, 14, 30), timeZone: "Australia/Sydney" });
    expect(r).toMatchObject({ startIso: "2026-02-01", endIso: "2026-02-28", daysInMonth: 28 });
    expect(monthRange("2026-03", { now: Date.UTC(2026, 1, 28, 14, 30), timeZone: "Australia/Sydney" }).isCurrentMonth).toBe(true); // 1 Mar locally
    expect(monthRange("2028-02").daysInMonth).toBe(29);
  });
  it("shiftMonthKey crosses year boundaries", () => {
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2026-06", 0)).toBe("2026-06");
  });
});

describe("metricsForType", () => {
  it("only weight x reps types offer a 1RM", () => {
    const withE1rm = ["weight_reps", "per_side_weight", "bodyweight_plus_weight", "bodyweight_reps", "reps_only", "assisted_bodyweight", "duration", "isometric_hold", "weighted_duration", "distance_duration", "weight_distance"]
      .filter((t) => metricsForType(t).some((m) => m.key === "1rm"));
    expect(withE1rm).toEqual(["weight_reps", "per_side_weight"]);
  });
});
