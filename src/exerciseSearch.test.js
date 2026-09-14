import { describe, it, expect } from "vitest";
import { matchesSearch } from "./App.jsx";

// Regression coverage for a real reported bug: searching "dumbbell press incline" found nothing
// even though "Incline Dumbbell Press" exists in the library — a plain contiguous-substring check
// requires the query to appear in that exact word order, which fails whenever the real exercise
// name puts the adjective first.
describe("matchesSearch — order-independent, per-word exercise search", () => {
  it("matches a multi-word query even when the words are in a different order than the name", () => {
    expect(matchesSearch("Incline Dumbbell Press", "dumbbell press incline")).toBe(true);
    expect(matchesSearch("Incline Dumbbell Press", "press dumbbell")).toBe(true);
  });

  it("matches a single word anywhere in the name", () => {
    expect(matchesSearch("Incline Dumbbell Press", "incline")).toBe(true);
    expect(matchesSearch("Incline Dumbbell Press", "dumbbell")).toBe(true);
    expect(matchesSearch("Incline Dumbbell Press", "press")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesSearch("Incline Dumbbell Press", "INCLINE DUMBBELL")).toBe(true);
  });

  it("requires every word in the query to be present — not just any one of them", () => {
    expect(matchesSearch("Incline Dumbbell Press", "dumbbell squat")).toBe(false);
  });

  it("an empty query matches everything", () => {
    expect(matchesSearch("Incline Dumbbell Press", "")).toBe(true);
    expect(matchesSearch("Incline Dumbbell Press", "   ")).toBe(true);
  });

  it("does not match an unrelated exercise", () => {
    expect(matchesSearch("Barbell Squat", "dumbbell press incline")).toBe(false);
  });

  it("still matches a genuine exact-phrase search (the common case)", () => {
    expect(matchesSearch("Barbell Bench Press", "barbell bench")).toBe(true);
  });
});
