import { describe, it, expect } from "vitest";
import { checkMacroConsistency, atwaterKcal, describeEntrySource, midpoint } from "./macroCheck";

describe("the audit's burger: 850 kcal with 55 g protein, 72 g carbs, 24 g fat", () => {
  const r = checkMacroConsistency({ calories: 850, protein: 55, carbs: 72, fat: 24 });
  it("macros add up to 724 kcal", () => {
    expect(atwaterKcal({ protein: 55, carbs: 72, fat: 24 })).toBe(724);
    expect(r.computedKcal).toBe(724);
  });
  it("is flagged inconsistent (a 126 kcal gap), says so in plain words, and suggests the arithmetic value", () => {
    expect(r.status).toBe("inconsistent");
    expect(r.diffKcal).toBe(126);
    expect(r.suggestedCalories).toBe(724);
    expect(r.message).toMatch(/come to about 724 kcal, not 850 kcal/);
  });
  it("does not silently rewrite anything: it only reports", () => {
    expect(r.statedKcal).toBe(850);
  });
});

describe("tolerances allow legitimate small differences", () => {
  it("rounding-level gaps are consistent", () => {
    expect(checkMacroConsistency({ calories: 250, protein: 20, carbs: 25, fat: 7 }).status).toBe("consistent"); // 243
    expect(checkMacroConsistency({ calories: 105, protein: 1, carbs: 27, fat: 0 }).status).toBe("consistent"); // 112
  });
  it("a moderate gap is a gentle note, not an error", () => {
    const r = checkMacroConsistency({ calories: 400, protein: 30, carbs: 30, fat: 15 }); // 375 + ... = 375
    expect(["consistent", "minor"]).toContain(r.status);
    const minor = checkMacroConsistency({ calories: 500, protein: 30, carbs: 40, fat: 18 }); // 442
    expect(minor.status).toBe("minor");
    expect(minor.message).toMatch(/can be normal/);
  });
  it("alcohol is energy too: a drink's calories are explained when alcohol grams are given", () => {
    expect(checkMacroConsistency({ calories: 150, protein: 1, carbs: 13, fat: 0 }).status).not.toBe("consistent");
    expect(checkMacroConsistency({ calories: 150, protein: 1, carbs: 13, fat: 0, alcohol: 14 }).status).toBe("consistent");
  });
  it("works for zero-calorie and very small foods without dividing by zero", () => {
    expect(checkMacroConsistency({ calories: 0, protein: 0, carbs: 0, fat: 0 }).status).toBe("consistent");
    expect(checkMacroConsistency({ calories: 5, protein: 0, carbs: 1, fat: 0 }).status).toBe("consistent");
  });
});

describe("unknown stays unknown", () => {
  it.each([
    [{ calories: 300, protein: "", carbs: 30, fat: 10 }],
    [{ calories: 300, protein: 20, carbs: null, fat: 10 }],
    [{ calories: undefined, protein: 20, carbs: 30, fat: 10 }],
    [{ calories: 300, protein: "abc", carbs: 30, fat: 10 }],
    [{}],
  ])("%j is 'incomplete', never treated as zero", (v) => {
    const r = checkMacroConsistency(v);
    expect(r.status).toBe("incomplete");
    expect(r.computedKcal).toBeNull();
    expect(r.suggestedCalories).toBeNull();
  });

  it("negative values are rejected", () => {
    expect(checkMacroConsistency({ calories: 300, protein: -5, carbs: 30, fat: 10 }).status).toBe("inconsistent");
  });

  it("accepts numeric strings from form inputs, including a decimal comma", () => {
    expect(checkMacroConsistency({ calories: "724", protein: "55", carbs: "72", fat: "24" }).status).toBe("consistent");
    expect(checkMacroConsistency({ calories: "250", protein: "20,5", carbs: "25", fat: "7" }).status).toBe("consistent");
  });
});

describe("estimate labelling", () => {
  it("marks AI estimates, photo scans and database products distinctly", () => {
    expect(describeEntrySource({ source: "ai_estimate" })).toBe("Estimate");
    expect(describeEntrySource({ estimated: true })).toBe("Estimate");
    expect(describeEntrySource({ source: "photo" })).toBe("Photo estimate");
    expect(describeEntrySource({ source: "barcode" })).toBe("Product database");
    expect(describeEntrySource({ name: "manual" })).toBeNull();
  });
  it("range midpoints are computed from the range, and unknown ranges stay unknown", () => {
    expect(midpoint([500, 700])).toBe(600);
    expect(midpoint(40)).toBe(40);
    expect(midpoint([700, 500])).toBeNull();
    expect(midpoint(null)).toBeNull();
    expect(midpoint(["a", 5])).toBeNull();
  });
});
