import { describe, it, expect } from "vitest";
import {
  isValidCustomExercise, isValidWorkout, isValidFoodEntry, isValidWeightEntry, isValidFavorite, sanitizeList,
  validateMacroOverride, isValidChatMessage, isValidChallenge,
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

  it("isValidChallenge requires an id, templateId, and startDate", () => {
    expect(isValidChallenge({ id: "c1", templateId: "consistency30", startDate: "2026-09-01" })).toBe(true);
    expect(isValidChallenge({ id: "c1", startDate: "2026-09-01" })).toBe(false);
    expect(isValidChallenge({ id: "", templateId: "consistency30", startDate: "2026-09-01" })).toBe(false);
    expect(isValidChallenge(null)).toBe(false);
  });
});

describe("validateMacroOverride — server-side guard on a manually-entered nutrition target", () => {
  it("accepts a realistic manual target", () => {
    expect(validateMacroOverride({ calories: 2800, protein: 180, carbs: 300, fat: 80 })).toBeNull();
  });

  it("rejects a missing or non-object payload", () => {
    expect(validateMacroOverride(null)).not.toBeNull();
    expect(validateMacroOverride(undefined)).not.toBeNull();
    expect(validateMacroOverride("2800")).not.toBeNull();
  });

  it("rejects negative or zero calories — a modified client sending garbage must not slip through", () => {
    expect(validateMacroOverride({ calories: -100, protein: 180, carbs: 300, fat: 80 })).not.toBeNull();
    expect(validateMacroOverride({ calories: 0, protein: 180, carbs: 300, fat: 80 })).not.toBeNull();
  });

  it("rejects an absurdly large value outside realistic human bounds", () => {
    expect(validateMacroOverride({ calories: 999999, protein: 180, carbs: 300, fat: 80 })).not.toBeNull();
    expect(validateMacroOverride({ calories: 2800, protein: 99999, carbs: 300, fat: 80 })).not.toBeNull();
  });

  it("rejects non-integer and non-numeric fields", () => {
    expect(validateMacroOverride({ calories: 2800.5, protein: 180, carbs: 300, fat: 80 })).not.toBeNull();
    expect(validateMacroOverride({ calories: "2800", protein: 180, carbs: 300, fat: 80 })).not.toBeNull();
    expect(validateMacroOverride({ calories: NaN, protein: 180, carbs: 300, fat: 80 })).not.toBeNull();
  });

  it("rejects a payload missing one of the four required fields", () => {
    expect(validateMacroOverride({ calories: 2800, protein: 180, carbs: 300 })).not.toBeNull();
  });
});

describe("isValidChatMessage — a persisted Coach conversation must survive a corrupted/old-shape row", () => {
  it("accepts a well-formed user or assistant message", () => {
    expect(isValidChatMessage({ role: "user", content: "How's my bench progressing?" })).toBe(true);
    expect(isValidChatMessage({ role: "assistant", content: "Great work this week." })).toBe(true);
  });

  it("rejects an unrecognized role", () => {
    expect(isValidChatMessage({ role: "system", content: "hi" })).toBe(false);
  });

  it("rejects non-string content", () => {
    expect(isValidChatMessage({ role: "user", content: 123 })).toBe(false);
    expect(isValidChatMessage({ role: "user", content: null })).toBe(false);
  });

  it("rejects null/non-object input without throwing", () => {
    expect(isValidChatMessage(null)).toBe(false);
    expect(isValidChatMessage("a string")).toBe(false);
    expect(isValidChatMessage(42)).toBe(false);
  });
});
