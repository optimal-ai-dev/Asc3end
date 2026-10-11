import { describe, it, expect } from "vitest";
import {
  createSession, normalizeSession, addExercises, removeExercise, restoreExercise, moveExercise, swapExercise, setExerciseNote,
  setExerciseRest, toggleSuperset, supersetRole, logSet, updateSet, removeSet, restoreSet, restSecondsFor, setProgress,
  sessionTotals, finalizeSession, adjustRest, clearRest, hasLoggedSets, DEFAULT_REST_SECONDS,
} from "./workoutSession";
import { EXERCISES } from "../exerciseData";

const ex = (name) => EXERCISES.find((e) => e.name === name);
const NOW = Date.UTC(2026, 9, 8, 14, 30, 0); // 01:30 on 9 Oct in Sydney
const SYD = "Australia/Sydney";
const base = () => createSession({ now: NOW, timeZone: SYD, id: "S1" });

describe("createSession", () => {
  it("stamps the LOCAL date, timezone and unit (not the UTC date)", () => {
    const s = base();
    expect(s).toMatchObject({ id: "S1", date: "2026-10-09", timeZone: SYD, unit: "kg", startedAt: NOW, restEndAt: null });
  });

  it("builds from a plan day, carrying each exercise's measurement type and target", () => {
    const planDay = { day: "Day 1: Core", muscleGroups: [{ muscle: "core", exercises: [{ name: "Plank", sets: 3, reps: "30-45s" }, { name: "Cable Lateral Raise", sets: 3, reps: "15-20" }] }] };
    const s = createSession({ planDay, plannedDayIndex: 0, now: NOW, timeZone: SYD, id: "P" });
    const [plank, lateral] = s.exercises;
    expect(plank).toMatchObject({ name: "Plank", trackingType: "isometric_hold", targetSets: 3, targetReps: "30-45s" });
    expect(lateral).toMatchObject({ name: "Cable Lateral Raise", trackingType: "weight_reps", targetReps: "15-20" });
    expect(s.planDayName).toBe("Day 1: Core");
    expect(s.exercises.every((e) => e.id && Array.isArray(e.sets))).toBe(true);
  });
});

describe("normalizeSession (sessions persisted before the new fields existed)", () => {
  it("fills ids and types, converts name-based superset links to ids, and leaves logged sets intact", () => {
    const legacy = { id: "old", startedAt: 5, exercises: [
      { name: "Barbell Bench Press", sets: [{ weight: 80, reps: 8, type: "normal" }], supersetWith: "Barbell Row" },
      { name: "Barbell Row", sets: [], supersetWith: "Barbell Bench Press" },
    ] };
    const n = normalizeSession(legacy);
    const [a, b] = n.exercises;
    expect(a.id).toBeTruthy();
    expect(a.supersetWith).toBe(b.id);
    expect(b.supersetWith).toBe(a.id);
    expect(a.trackingType).toBe("weight_reps");
    expect(a.sets[0]).toMatchObject({ weight: 80, reps: 8 });
    expect(a.sets[0].id).toBeTruthy();
    expect(n.restDefaultSeconds).toBe(DEFAULT_REST_SECONDS);
  });

  it("a legacy {weight, reps} plank entry is NOT silently re-typed as a hold", () => {
    const n = normalizeSession({ id: "x", startedAt: 1, exercises: [{ name: "Plank", sets: [{ weight: 10, reps: 5 }] }] });
    expect(n.exercises[0].trackingType).toBe("weight_reps");
  });
});

describe("adding, removing and reordering", () => {
  it("multi-add adds many at once and never duplicates an exercise", () => {
    const { session, added } = addExercises(base(), [ex("Barbell Bench Press"), ex("Barbell Row"), ex("Plank")], { now: NOW });
    expect(session.exercises.map((e) => e.name)).toEqual(["Barbell Bench Press", "Barbell Row", "Plank"]);
    expect(added).toHaveLength(3);
    const again = addExercises(session, [ex("Plank"), ex("Pull-Up")], { now: NOW + 1 });
    expect(again.session.exercises.map((e) => e.name)).toEqual(["Barbell Bench Press", "Barbell Row", "Plank", "Pull-Up"]);
    expect(again.added).toHaveLength(1);
  });

  it("removal clears superset links and can be undone in place", () => {
    let s = addExercises(base(), [ex("Barbell Bench Press"), ex("Barbell Row"), ex("Plank")]).session;
    s = toggleSuperset(s, s.exercises[0].id, s.exercises[1].id);
    const { session, removed, index } = removeExercise(s, s.exercises[1].id);
    expect(session.exercises.map((e) => e.name)).toEqual(["Barbell Bench Press", "Plank"]);
    expect(session.exercises[0].supersetWith).toBeNull();
    const restored = restoreExercise(session, removed, index);
    expect(restored.exercises.map((e) => e.name)).toEqual(["Barbell Bench Press", "Barbell Row", "Plank"]);
  });

  it("reorders up and down and ignores moves off the ends", () => {
    let s = addExercises(base(), [ex("Barbell Bench Press"), ex("Barbell Row"), ex("Plank")]).session;
    const id = s.exercises[2].id;
    s = moveExercise(s, id, -1);
    expect(s.exercises.map((e) => e.name)).toEqual(["Barbell Bench Press", "Plank", "Barbell Row"]);
    expect(moveExercise(s, s.exercises[0].id, -1)).toBe(s);
    expect(moveExercise(s, s.exercises[2].id, 1)).toBe(s);
  });
});

describe("swap an unavailable machine without rebuilding the workout", () => {
  it("keeps position, target, note, rest and logged sets when the measurement type matches", () => {
    let s = addExercises(base(), [ex("Chest Press Machine"), ex("Plank")]).session;
    const id = s.exercises[0].id;
    s = { ...s, exercises: s.exercises.map((e) => (e.id === id ? { ...e, targetSets: 3, targetReps: "8-12" } : e)) };
    s = setExerciseNote(s, id, "seat 4");
    s = setExerciseRest(s, id, 120);
    s = logSet(s, id, { weight: 60, reps: 10 }, { now: NOW }).session;
    const { session, dropped } = swapExercise(s, id, ex("Flat Dumbbell Press"));
    const swapped = session.exercises[0];
    expect(swapped).toMatchObject({ id, name: "Flat Dumbbell Press", targetSets: 3, targetReps: "8-12", note: "seat 4", restSeconds: 120, swappedFrom: "Chest Press Machine" });
    expect(swapped.sets).toHaveLength(1);
    expect(dropped).toEqual([]);
    expect(session.exercises[1].name).toBe("Plank");
  });

  it("drops (and reports) logged sets that make no sense for the new measurement type", () => {
    let s = addExercises(base(), [ex("Chest Press Machine")]).session;
    const id = s.exercises[0].id;
    s = logSet(s, id, { weight: 60, reps: 10 }).session;
    const { session, dropped } = swapExercise(s, id, ex("Plank"));
    expect(session.exercises[0].trackingType).toBe("isometric_hold");
    expect(session.exercises[0].sets).toEqual([]);
    expect(dropped).toHaveLength(1);
    expect(session.exercises[0].targetReps).toBeUndefined(); // a rep target must not leak onto a timed hold
  });

  it("refuses to swap into an exercise already in the workout", () => {
    const s = addExercises(base(), [ex("Chest Press Machine"), ex("Plank")]).session;
    expect(swapExercise(s, s.exercises[0].id, ex("Plank")).duplicate).toBe(true);
  });
});

describe("superset order and rest behaviour", () => {
  const setup = () => {
    let s = addExercises(base(), [ex("Barbell Bench Press"), ex("Barbell Row"), ex("Plank")]).session;
    s = toggleSuperset(s, s.exercises[0].id, s.exercises[1].id);
    return s;
  };

  it("links symmetrically; the earlier exercise leads", () => {
    const s = setup();
    expect(s.exercises[0].supersetWith).toBe(s.exercises[1].id);
    expect(s.exercises[1].supersetWith).toBe(s.exercises[0].id);
    expect(supersetRole(s, s.exercises[0].id)).toBe("lead");
    expect(supersetRole(s, s.exercises[1].id)).toBe("follow");
    expect(supersetRole(s, s.exercises[2].id)).toBeNull();
  });

  it("no rest after the lead (go straight to the partner); rest starts after the partner", () => {
    let s = setup();
    const [a, b] = s.exercises;
    const first = logSet(s, a.id, { weight: 80, reps: 8 }, { now: NOW });
    expect(first.startedRest).toBe(false);
    expect(first.session.restEndAt).toBeNull();
    expect(first.next).toBe(b.id);
    const second = logSet(first.session, b.id, { weight: 60, reps: 10 }, { now: NOW + 5000 });
    expect(second.startedRest).toBe(true);
    expect(second.session.restEndAt).toBe(NOW + 5000 + DEFAULT_REST_SECONDS * 1000);
    expect(second.next).toBeNull();
  });

  it("the rest after a pair uses the longer of the two exercises' rest settings", () => {
    let s = setup();
    s = setExerciseRest(s, s.exercises[0].id, 60);
    s = setExerciseRest(s, s.exercises[1].id, 150);
    const res = logSet(s, s.exercises[1].id, { weight: 60, reps: 10 }, { now: NOW });
    expect(res.session.restEndAt).toBe(NOW + 150000);
  });

  it("re-ordering swaps who leads, so the rule follows the new order", () => {
    let s = setup();
    s = moveExercise(s, s.exercises[0].id, 1);
    expect(supersetRole(s, s.exercises[0].id)).toBe("lead");
    expect(s.exercises[0].name).toBe("Barbell Row");
  });

  it("toggling again unlinks both; linking a third exercise moves the pair", () => {
    let s = setup();
    const [a, b, c] = s.exercises;
    const unlinked = toggleSuperset(s, a.id, b.id);
    expect(unlinked.exercises.every((e) => e.supersetWith === null)).toBe(true);
    const relinked = toggleSuperset(s, a.id, c.id);
    expect(relinked.exercises[1].supersetWith).toBeNull();
    expect(relinked.exercises[0].supersetWith).toBe(c.id);
  });

  it("a normal exercise starts the per-exercise rest, not a global one", () => {
    let s = addExercises(base(), [ex("Plank")]).session;
    s = setExerciseRest(s, s.exercises[0].id, 45);
    expect(logSet(s, s.exercises[0].id, { durationSeconds: 30 }, { now: NOW }).session.restEndAt).toBe(NOW + 45000);
    expect(restSecondsFor(s, s.exercises[0])).toBe(45);
    expect(restSecondsFor(base(), {})).toBe(90);
    s = setExerciseRest(s, s.exercises[0].id, 0);
    expect(s.exercises[0].restSeconds).toBeUndefined();
  });
});

describe("logging, inline correction and undo", () => {
  it("log -> correct inline -> undo a delete restores the set where it was", () => {
    let s = addExercises(base(), [ex("Barbell Bench Press")]).session;
    const id = s.exercises[0].id;
    s = logSet(s, id, { weight: 80, reps: 8 }, { now: NOW }).session;
    s = logSet(s, id, { weight: 80, reps: 7 }, { now: NOW + 1000 }).session;
    const [first, second] = s.exercises[0].sets;
    s = updateSet(s, id, first.id, { weight: 82.5 });
    expect(s.exercises[0].sets[0]).toMatchObject({ weight: 82.5, reps: 8, type: "normal" });
    const del = removeSet(s, id, first.id);
    expect(del.session.exercises[0].sets.map((x) => x.id)).toEqual([second.id]);
    const undone = restoreSet(del.session, id, del.removed, del.index);
    expect(undone.exercises[0].sets.map((x) => x.id)).toEqual([first.id, second.id]);
  });

  it("every logged set gets a stable id and completion time; updatedAt moves with every change", () => {
    let s = addExercises(base(), [ex("Plank")], { now: NOW + 10 }).session;
    expect(s.updatedAt).toBe(NOW + 10);
    const r = logSet(s, s.exercises[0].id, { durationSeconds: 30 }, { now: NOW + 99 });
    expect(r.set).toMatchObject({ durationSeconds: 30, type: "normal", completedAt: NOW + 99 });
    expect(r.set.id).toBeTruthy();
    expect(r.session.updatedAt).toBe(NOW + 99);
  });

  it("rest controls adjust and clear", () => {
    let s = { ...base(), restEndAt: NOW + 60000 };
    expect(adjustRest(s, 15, { now: NOW }).restEndAt).toBe(NOW + 75000);
    expect(adjustRest(s, -999, { now: NOW }).restEndAt).toBe(NOW);
    expect(clearRest(s).restEndAt).toBeNull();
    expect(adjustRest(base(), 15)).toEqual(base());
  });
});

describe("progress, totals and finalizing", () => {
  it("planned vs completed", () => {
    expect(setProgress({ targetSets: 4, sets: [{}, {}] })).toEqual({ done: 2, planned: 4, remaining: 2, complete: false });
    expect(setProgress({ targetSets: 2, sets: [{}, {}, {}] })).toMatchObject({ remaining: 0, complete: true });
    expect(setProgress({ sets: [{}] })).toMatchObject({ planned: 0, complete: false });
  });

  it("totals count working sets only and give a plank no tonnage", () => {
    let s = addExercises(base(), [ex("Barbell Bench Press"), ex("Plank")]).session;
    const [bench, plank] = s.exercises;
    s = logSet(s, bench.id, { weight: 20, reps: 5, type: "warmup" }).session;
    s = logSet(s, bench.id, { weight: 80, reps: 10 }).session;
    s = logSet(s, plank.id, { durationSeconds: 30 }).session;
    expect(sessionTotals(s)).toEqual({ sets: 2, volume: 800 });
    expect(hasLoggedSets(s)).toBe(true);
    expect(hasLoggedSets(base())).toBe(false);
  });

  it("finalizeSession keeps the id (idempotency key) and drops live-UI fields", () => {
    let s = addExercises(base(), [ex("Plank")]).session;
    s = { ...s, restEndAt: NOW + 1000 };
    const w = finalizeSession(s, { now: NOW + 60000, xpBreakdown: { total: 60 }, prs: [] });
    expect(w).toMatchObject({ id: "S1", date: "2026-10-09", timeZone: SYD, completedAt: new Date(NOW + 60000).toISOString(), xpBreakdown: { total: 60 } });
    expect(w.restEndAt).toBeUndefined();
    expect(w.restDefaultSeconds).toBeUndefined();
  });
});
