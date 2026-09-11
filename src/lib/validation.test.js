import { describe, it, expect } from "vitest";
import {
  isValidCustomExercise, isValidWorkout, isValidFoodEntry, isValidWeightEntry, isValidFavorite, sanitizeList,
} from "./validation";

describe("sanitizeList — malformed stored data cannot crash the app", () => {
  it("coerces a non-array value to an empty array instead of throwing", () => {
    expect(sanitizeList("not an array", isValidWorkout)).toEqual([]);
    expect(sanitizeList({ not: "an array" }, isValidWorkout)).toEqual([]);
    expect(sanitizeList(null, isValidWorkout)).toEqual([]);
    expect(sanitizeList(undefined, isValidWorkout)).toEqual([]);
    expect(sanitizeList(12345, isValidWorkout)).toEqual([]);
  });

  it("drops individually malformed items instead of crashing on the whole list — the live repro case", () => {
    // This exact shape (array of bare numbers) crashed Train's exercise search live via
    // `e.name.toLowerCase()` before item-level validation existed.
    expect(sanitizeList([1, 2, 3], isValidCustomExercise)).toEqual([]);
    const mixed = [
      { name: "Cable Row", muscle: "back", equipment: "Cable" },
      { name: "Missing muscle field" },
      null,
      42,
      "a string",
    ];
    expect(sanitizeList(mixed, isValidCustomExercise)).toEqual([{ name: "Cable Row", muscle: "back", equipment: "Cable" }]);
  });

  it("never throws even if the validator itself throws on a weird item", () => {
    const throwingValidator = (item) => { if (item === "boom") throw new Error("boom"); return true; };
    expect(() => sanitizeList(["ok", "boom"], throwingValidator)).not.toThrow();
    expect(sanitizeList(["ok", "boom"], throwingValidator)).toEqual(["ok"]);
  });
});

describe("individual shape validators", () => {
  it("isValidWorkout requires id, date, and an exercises array", () => {
    expect(isValidWorkout({ id: "w1", date: "2026-01-01", exercises: [] })).toBe(true);
    expect(isValidWorkout({ id: "w1", date: "2026-01-01" })).toBe(false);
    expect(isValidWorkout({ id: "", date: "2026-01-01", exercises: [] })).toBe(false);
    expect(isValidWorkout(null)).toBe(false);
    expect(isValidWorkout("workout")).toBe(false);
  });

  it("isValidFoodEntry requires id, date, name and a finite calories number", () => {
    expect(isValidFoodEntry({ id: "f1", date: "2026-01-01", name: "Oats", calories: 300 })).toBe(true);
    expect(isValidFoodEntry({ id: "f1", date: "2026-01-01", name: "Oats", calories: NaN })).toBe(false);
    expect(isValidFoodEntry({ id: "f1", date: "2026-01-01", name: "Oats", calories: "300" })).toBe(false);
  });

  it("isValidWeightEntry requires a date and a finite weight number", () => {
    expect(isValidWeightEntry({ date: "2026-01-01", weight: 75.5 })).toBe(true);
    expect(isValidWeightEntry({ date: "2026-01-01", weight: Infinity })).toBe(false);
    expect(isValidWeightEntry({ weight: 75.5 })).toBe(false);
  });

  it("isValidFavorite requires a name and a finite calories number", () => {
    expect(isValidFavorite({ name: "Protein Shake", calories: 130 })).toBe(true);
    expect(isValidFavorite({ calories: 130 })).toBe(false);
  });
});
