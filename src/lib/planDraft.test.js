import { describe, it, expect } from "vitest";
import { normalizePlanDays, createDraft, updateDraftDays, activePlanFromDraft, isValidDraft, defaultTargetFor, resolvePlanExercise, daysEqual } from "./planDraft";
import { createSession } from "./workoutSession";

const day = (exercises, name = "Day 1: Push") => ({ day: name, muscleGroups: [{ muscle: "chest", exercises }] });

describe("normalising a generated plan (the measurement types and targets must survive into the session)", () => {
  it("a rep range generated for a timed hold is replaced with a hold time; a time for a lift becomes reps", () => {
    const { days, changes } = normalizePlanDays([day([
      { name: "Plank", sets: 3, reps: "8-12" },
      { name: "Barbell Bench Press", sets: 4, reps: "30-45s" },
      { name: "Weighted Plank", sets: 2, reps: "10" },
    ])], { goal: "muscle_growth" });
    const [plank, bench, weighted] = days[0].muscleGroups[0].exercises;
    expect(plank.reps).toBe("30-60s");
    expect(bench.reps).toBe("8-12");
    expect(weighted.reps).toBe("30-60s");
    expect(changes.join(" ")).toMatch(/Plank: target "8-12" replaced with "30-60s"/);
  });

  it("valid targets are left exactly as given, including seconds for holds and the plan's own rep ranges", () => {
    const { days, changes } = normalizePlanDays([day([
      { name: "Plank", sets: 3, reps: "30-45s" },
      { name: "Cable Lateral Raise", sets: 3, reps: "15-20" },
      { name: "Back Squat", sets: 5, reps: 5 },
    ])], { goal: "strength" });
    expect(days[0].muscleGroups[0].exercises.map((e) => e.reps)).toEqual(["30-45s", "15-20", "5"]);
    expect(changes).toEqual([]);
  });

  it("distance-logged exercises carry no rep target", () => {
    const { days } = normalizePlanDays([day([{ name: "Treadmill Run", sets: 1, reps: "10" }])], { goal: "general" });
    expect(days[0].muscleGroups[0].exercises[0].reps).toBe("");
  });

  it("resolves names to the catalogue (alias, case, containment) and flags what it cannot", () => {
    expect(resolvePlanExercise("bench press").name).toBe("Barbell Bench Press");
    expect(resolvePlanExercise("RDL").name).toBe("Romanian Deadlift");
    expect(resolvePlanExercise("zzz not a thing")).toBeNull();
    const { days } = normalizePlanDays([day([{ name: "Made Up Lift", sets: 3, reps: "8-12" }, { name: "pull-up", sets: 3, reps: "AMRAP" }])], { goal: "muscle_growth" });
    const [made, pullup] = days[0].muscleGroups[0].exercises;
    expect(made).toMatchObject({ name: "Made Up Lift", unmatched: true });
    expect(pullup).toMatchObject({ name: "Pull-Up", reps: "8-12" });
  });

  it("sets are coerced to a sane whole number; empty groups and days are dropped", () => {
    const { days } = normalizePlanDays([
      day([{ name: "Plank", sets: "x", reps: "30s" }, { name: "Back Squat", sets: 40, reps: "5" }, { name: "", sets: 3, reps: "5" }]),
      { day: "Empty", muscleGroups: [{ muscle: "arms", exercises: [] }] },
      null, { day: "bad" },
    ], { goal: "general" });
    expect(days).toHaveLength(1);
    expect(days[0].muscleGroups[0].exercises.map((e) => [e.name, e.sets])).toEqual([["Plank", 3], ["Back Squat", 12]]);
  });

  it("never throws on garbage input", () => {
    expect(normalizePlanDays(undefined).days).toEqual([]);
    expect(normalizePlanDays("x").days).toEqual([]);
    expect(normalizePlanDays([{ muscleGroups: "no" }]).days).toEqual([]);
  });

  it("defaults are valid for the type", () => {
    expect(defaultTargetFor("isometric_hold", "strength")).toBe("30-60s");
    expect(defaultTargetFor("weight_reps", "strength")).toBe("4-6");
    expect(defaultTargetFor("distance_duration")).toBe("");
  });
});

describe("draft lifecycle: generate -> edit -> restore -> activate -> start the assigned workout", () => {
  const generated = [day([{ name: "Barbell Bench Press", sets: 3, reps: "8-12" }, { name: "Plank", sets: 2, reps: "8-12" }, { name: "Cable Lateral Raise", sets: 3, reps: "15-20" }])];

  it("a draft is its own object, status 'draft', with a stable id and the normalised days", () => {
    const d = createDraft({ days: generated, goal: "muscle_growth", coachingStyle: "balanced", now: 1000, id: "d1" });
    expect(d).toMatchObject({ id: "d1", status: "draft", createdAt: 1000, goal: "muscle_growth", version: 1 });
    expect(isValidDraft(d)).toBe(true);
    expect(d.days[0].muscleGroups[0].exercises[1]).toMatchObject({ name: "Plank", reps: "30-60s" });
  });

  it("survives a storage round trip unchanged (what a refresh restores is exactly what was saved)", () => {
    const d = createDraft({ days: generated, goal: "muscle_growth", id: "d1", now: 5 });
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
    expect(isValidDraft(JSON.parse(JSON.stringify(d)))).toBe(true);
  });

  it("editing normalises again, keeps the draft id and bumps updatedAt", () => {
    const d = createDraft({ days: generated, goal: "muscle_growth", id: "d1", now: 5 });
    const edited = updateDraftDays(d, [day([{ name: "Plank", sets: 4, reps: "45s" }, { name: "Dumbbell Curl", sets: 3, reps: "10-12" }])], { now: 99 });
    expect(edited).toMatchObject({ id: "d1", updatedAt: 99, createdAt: 5 });
    expect(edited.days[0].muscleGroups[0].exercises.map((e) => `${e.name}:${e.sets}:${e.reps}`)).toEqual(["Plank:4:45s", "Dumbbell Curl:3:10-12"]);
  });

  it("activation is explicit and produces the active plan Home runs from (draft id retained)", () => {
    const d = createDraft({ days: generated, goal: "muscle_growth", id: "d1" });
    const plan = activePlanFromDraft(d, { now: Date.UTC(2026, 9, 11) });
    expect(plan).toMatchObject({ currentDayIndex: 0, sourceDraftId: "d1", activatedAt: "2026-10-11T00:00:00.000Z" });
    expect(plan.days).toBe(d.days);
  });

  it("the assigned workout carries each exercise's measurement type and target into the session", () => {
    const d = createDraft({ days: generated, goal: "muscle_growth", id: "d1" });
    const plan = activePlanFromDraft(d);
    const session = createSession({ planDay: plan.days[0], plannedDayIndex: 0, now: Date.UTC(2026, 9, 11), timeZone: "Australia/Sydney" });
    const byName = Object.fromEntries(session.exercises.map((e) => [e.name, e]));
    expect(byName["Plank"]).toMatchObject({ trackingType: "isometric_hold", targetSets: 2, targetReps: "30-60s" });
    expect(byName["Barbell Bench Press"]).toMatchObject({ trackingType: "weight_reps", targetSets: 3, targetReps: "8-12" });
    expect(byName["Cable Lateral Raise"]).toMatchObject({ trackingType: "weight_reps", targetReps: "15-20" });
  });

  it("invalid / empty drafts are rejected so a corrupt row can't crash the screen", () => {
    expect(isValidDraft(null)).toBe(false);
    expect(isValidDraft({})).toBe(false);
    expect(isValidDraft({ id: "x", days: [] })).toBe(false);
    expect(isValidDraft({ id: "x", days: [{ muscleGroups: "no" }] })).toBe(false);
  });

  it("unsaved-edit detection is structural", () => {
    expect(daysEqual(generated, JSON.parse(JSON.stringify(generated)))).toBe(true);
    expect(daysEqual(generated, [])).toBe(false);
  });
});
