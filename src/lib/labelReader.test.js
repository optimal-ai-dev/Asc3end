import { describe, it, expect, vi } from "vitest";
vi.mock("./supabase", () => ({ supabase: {} }));
import { labelToForm } from "./labelReader";

describe("labelToForm", () => {
  it("uses per-serving values when the panel has them", () => {
    expect(labelToForm({ name: "Bar", servingGrams: 45, perServing: { calories: 190, protein: 10, carbs: 20, fat: 7.25 }, per100g: { calories: 422, protein: 22, carbs: 44, fat: 16 } }))
      .toEqual({ name: "Bar", brand: "", servingGrams: "45", calories: "190", protein: "10", carbs: "20", fat: "7.3" });
  });

  it("scales per-100 g values to the serving when that's all there is", () => {
    expect(labelToForm({ servingGrams: 30, per100g: { calories: 400, protein: 10, carbs: 60, fat: 12 } }))
      .toMatchObject({ servingGrams: "30", calories: "120", protein: "3", carbs: "18", fat: "3.6" });
    expect(labelToForm({ per100g: { calories: 400, protein: 10, carbs: 60, fat: 12 } })).toMatchObject({ servingGrams: "100", calories: "400" });
  });

  it("gives up on unreadable numbers", () => {
    expect(labelToForm({ perServing: { calories: "?" } })).toBeNull();
  });
});
