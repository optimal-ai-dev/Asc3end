import { describe, it, expect, vi } from "vitest";
vi.mock("./supabase", () => ({ supabase: {} }));
import { labelToForm, parseLabelNumber } from "./labelReader";

const col = (energyKj, energyKcal, protein, carbs, fat) => ({ energyKj, energyKcal, protein, carbs, fat });

describe("parseLabelNumber", () => {
  it("reads values the way they're printed on panels", () => {
    expect(parseLabelNumber("41.0g")).toBe(41);
    expect(parseLabelNumber("0,3 g")).toBe(0.3);
    expect(parseLabelNumber("<1g")).toBe(0.5);
    expect(parseLabelNumber("LESS THAN 1g")).toBe(0.5);
    expect(parseLabelNumber("Nil")).toBe(0);
    expect(parseLabelNumber("250mL")).toBe(250);
    expect(parseLabelNumber(12.5)).toBe(12.5);
    expect(parseLabelNumber("?")).toBeNull();
  });
});

describe("labelToForm", () => {
  it("copies an orange juice's per-serving column exactly, converting kJ in code", () => {
    // 250 mL serving, kJ only — the case that used to drift by several calories.
    const form = labelToForm({
      name: "Orange Juice", brand: "Nudie", servingSize: "250mL", per100Unit: "mL",
      perServing: col("455kJ", null, "1.8g", "24.3g", "<1g"),
      per100: col("182kJ", null, "0.7g", "9.7g", "0.1g"),
    });
    expect(form).toMatchObject({ servingGrams: "250", servingUnit: "ml", calories: "109", protein: "1.8", carbs: "24.3", fat: "0.5", basis: "per serving" });
    expect(form.energyKj).toBe(455);
    expect(form.checks).toEqual([]);
  });

  it("prefers the printed kcal over converting kJ", () => {
    expect(labelToForm({ servingSize: "45g", perServing: col("795kJ", "190Cal", "10g", "20g", "7.25g") }))
      .toMatchObject({ servingGrams: "45", calories: "190", fat: "7.25" });
  });

  it("scales the per-100 column when there's no per-serving column", () => {
    expect(labelToForm({ servingSize: "30g", per100: col(null, "400", "10", "60", "12") }))
      .toMatchObject({ servingGrams: "30", calories: "120", protein: "3", carbs: "18", fat: "3.6", basis: "per 100 g, scaled to 30 g" });
  });

  it("uses a 100 g serving, and says so, when no serving size is printed", () => {
    const form = labelToForm({ per100: col("1674kJ", null, "10", "60", "12") });
    expect(form).toMatchObject({ servingGrams: "100", calories: "400" });
    expect(form.checks.join(" ")).toMatch(/No serving size/);
  });

  it("flags columns that disagree and energy that doesn't add up", () => {
    const form = labelToForm({ servingSize: "250mL", perServing: col("455kJ", null, "1.8g", "34.3g", "0.1g"), per100: col("182kJ", null, "0.7g", "9.7g", "0.1g") });
    expect(form.checks.join(" ")).toMatch(/don't line up for carbs/);
    expect(form.checks.join(" ")).toMatch(/energy doesn't match/);
  });

  it("still reads the older numeric response shape", () => {
    expect(labelToForm({ name: "Bar", servingGrams: 45, perServing: { calories: 190, protein: 10, carbs: 20, fat: 7.25 } }))
      .toMatchObject({ name: "Bar", servingGrams: "45", calories: "190", fat: "7.25" });
  });

  it("gives up on unreadable numbers", () => {
    expect(labelToForm({ perServing: { calories: "?" } })).toBeNull();
  });
});
