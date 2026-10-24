import { describe, it, expect } from "vitest";
import { normalizeFdcFood, normalizeOffProduct, unitOptions, defaultAmount, gramsFor, nutrientsFor, toDiaryEntry, mergeResults, isValidBarcode } from "./foodData";

const fdcBanana = {
  fdcId: 2709224, description: "BANANA, RAW", dataType: "Survey (FNDDS)",
  foodNutrients: [
    { nutrientId: 1008, value: 89, unitName: "KCAL" }, { nutrientId: 1003, value: 1.09 },
    { nutrientId: 1004, value: 0.33 }, { nutrientId: 1005, value: 22.8 }, { nutrientId: 1079, value: 2.6 },
  ],
  foodMeasures: [
    { disseminationText: "1 medium (7\" to 7-7/8\" long)", gramWeight: 118 },
    { disseminationText: "1 cup, sliced", gramWeight: 150 },
    { disseminationText: "Quantity not specified", gramWeight: 118 },
  ],
};

describe("normalizeFdcFood", () => {
  it("reads per-100 g macros and household measures for generic foods", () => {
    const f = normalizeFdcFood(fdcBanana);
    expect(f).toMatchObject({ id: "fdc:2709224", source: "usda", name: "Banana, Raw", generic: true, brand: null });
    expect(f.per100g).toMatchObject({ calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 });
    expect(f.portions.map((p) => p.label)).toEqual(["1 medium (7\" to 7-7/8\" long)", "1 cup, sliced"]);
  });

  it("falls back to Atwater energy, then to macros, when 1008 is missing", () => {
    const atwater = normalizeFdcFood({ fdcId: 1, description: "x", dataType: "Foundation", foodNutrients: [{ nutrientId: 2047, value: 120 }] });
    expect(atwater.per100g.calories).toBe(120);
    const fromMacros = normalizeFdcFood({ fdcId: 2, description: "y", dataType: "SR Legacy", foodNutrients: [{ nutrientId: 1003, value: 10 }, { nutrientId: 1004, value: 10 }] });
    expect(fromMacros.per100g.calories).toBe(130);
  });

  it("puts a branded product's serving first", () => {
    const f = normalizeFdcFood({ fdcId: 3, description: "Greek Yogurt Plain", dataType: "Branded", brandOwner: "Chobani", servingSize: 170, servingSizeUnit: "g", householdServingFullText: "1 container", foodNutrients: [{ nutrientId: 1008, value: 59 }] });
    expect(f.brand).toBe("Chobani");
    expect(f.portions[0]).toEqual({ label: "1 serving (1 container)", grams: 170 });
  });

  it("rejects rows without an id or name", () => {
    expect(normalizeFdcFood({ description: "x" })).toBeNull();
    expect(normalizeFdcFood(null)).toBeNull();
  });
});

describe("normalizeOffProduct", () => {
  it("reads nutriments, serving and pack size", () => {
    const f = normalizeOffProduct({
      code: "3017620422003", product_name: "Nutella", brands: "Ferrero,Nutella",
      serving_size: "15 g", serving_quantity: 15, product_quantity: 400,
      nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, sodium_100g: 0.0428 },
    });
    expect(f).toMatchObject({ id: "off:3017620422003", brand: "Ferrero", barcode: "3017620422003" });
    expect(f.per100g).toMatchObject({ calories: 539, protein: 6.3, fat: 30.9, sodium: 42.8 });
    expect(f.portions).toEqual([{ label: "1 serving (15 g)", grams: 15 }, { label: "Whole pack (400 g)", grams: 400 }]);
  });

  it("converts kJ when kcal is missing and drops products with no nutrition", () => {
    expect(normalizeOffProduct({ code: "1", product_name: "A", nutriments: { energy_100g: 418.4 } }).per100g.calories).toBe(100);
    expect(normalizeOffProduct({ code: "2", product_name: "B", nutriments: {} })).toBeNull();
    expect(normalizeOffProduct({ code: "3", nutriments: { proteins_100g: 1 } })).toBeNull();
  });
});

describe("amounts", () => {
  const food = normalizeFdcFood(fdcBanana);

  it("offers servings, then grams and ounces, defaulting to one serving", () => {
    expect(unitOptions(food).map((u) => u.label).slice(-2)).toEqual(["g", "oz"]);
    expect(defaultAmount(food)).toEqual({ quantity: 1, unit: food.portions[0] });
    expect(defaultAmount({ portions: [] }).quantity).toBe(100);
  });

  it("scales macros by weight", () => {
    expect(gramsFor(2, { label: "1 cup, sliced", grams: 150 })).toBe(300);
    expect(gramsFor("", { grams: 1 })).toBe(0);
    expect(gramsFor(-1, { grams: 1 })).toBe(0);
    expect(nutrientsFor(food.per100g, 300)).toEqual({ calories: 267, protein: 3.3, carbs: 68.4, fat: 0.9 });
  });

  it("builds a diary entry that remembers its portion", () => {
    const e = toDiaryEntry(food, 2, food.portions[1], { id: "a", date: "2026-10-24", meal: "breakfast" });
    expect(e).toMatchObject({ id: "a", meal: "breakfast", name: "Banana, Raw", calories: 267, grams: 300, amount: "2 × 1 cup, sliced", foodId: "fdc:2709224" });
    expect(e.per100g.calories).toBe(89);
    expect(toDiaryEntry(food, 150, { label: "g", grams: 1 }, {}).amount).toBe("150 g");
  });
});

describe("mergeResults", () => {
  it("lists generic foods first, interleaves branded, and drops duplicates", () => {
    const g = { id: "g", name: "Rice", generic: true };
    const b1 = { id: "b1", name: "Rice Cakes", brand: "Quaker", generic: false };
    const o1 = { id: "o1", name: "Rice cakes", brand: "Quaker", generic: false };
    const o2 = { id: "o2", name: "Basmati", brand: "Tilda", generic: false };
    expect(mergeResults([b1, g], [o1, o2]).map((f) => f.id)).toEqual(["g", "b1", "o2"]);
  });
});

it("validates barcodes", () => {
  expect(isValidBarcode("3017620422003")).toBe(true);
  expect(isValidBarcode("12ab")).toBe(false);
  expect(isValidBarcode("")).toBe(false);
});
