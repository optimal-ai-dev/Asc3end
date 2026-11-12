import { describe, it, expect } from "vitest";
import { buildStarterPlan } from "./starterPlan";
import { EXERCISES } from "../exerciseData";

const NAMES = new Set(EXERCISES.map((e) => e.name));
const MUSCLES = ["chest", "back", "shoulders", "arms", "legs", "core"];

describe("buildStarterPlan — the plan onboarding's \"Build My Plan\" creates", () => {
  it.each([2, 3, 4, 5, 6])("builds one day per training day (%i days)", (n) => {
    const plan = buildStarterPlan({ trainingDays: n, goal: "muscle_growth", experience: "intermediate" });
    expect(plan.days).toHaveLength(n);
    plan.days.forEach((d, i) => expect(d.day).toMatch(new RegExp(`^Day ${i + 1}: `)));
  });

  it("only uses real exercises and valid muscle groups, so every exercise links to form cues", () => {
    for (const n of [2, 3, 4, 5, 6]) {
      for (const d of buildStarterPlan({ trainingDays: n }).days) {
        expect(d.muscleGroups.length).toBeGreaterThan(0);
        for (const mg of d.muscleGroups) {
          expect(MUSCLES).toContain(mg.muscle);
          for (const e of mg.exercises) {
            expect(NAMES.has(e.name)).toBe(true);
            expect(e.sets).toBeGreaterThan(0);
            expect(typeof e.reps).toBe("string");
          }
        }
      }
    }
  });

  it("uses heavier rep ranges for strength and lower volume for beginners", () => {
    const strength = buildStarterPlan({ trainingDays: 4, goal: "strength", experience: "advanced" });
    const bench = strength.days[0].muscleGroups[0].exercises[0];
    expect(bench).toEqual({ name: "Barbell Bench Press", sets: 4, reps: "4-6" });
    const beginner = buildStarterPlan({ trainingDays: 4, goal: "strength", experience: "beginner" });
    expect(beginner.days[0].muscleGroups[0].exercises[0].sets).toBe(3);
  });

  it("clamps out-of-range or missing training days instead of crashing", () => {
    expect(buildStarterPlan({ trainingDays: 9 }).days).toHaveLength(6);
    expect(buildStarterPlan({ trainingDays: 1 }).days).toHaveLength(2);
    expect(buildStarterPlan({}).days).toHaveLength(3);
  });
});
