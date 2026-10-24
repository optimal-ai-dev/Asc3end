import { describe, it, expect } from "vitest";
import { normalizeFdcFood, normalizeOffProduct, unitOptions, defaultAmount, gramsFor, nutrientsFor, toDiaryEntry, isValidBarcode, parseQuery, rankResults, myFoodFromLabel, myFoodToResult, searchMyFoods, tokens } from "./foodData";

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

describe("parseQuery", () => {
  it("maps stores to the house brand on their labels", () => {
    expect(parseQuery("Costco chicken")).toEqual({ brand: "kirkland signature", food: "chicken", branded: "kirkland signature chicken" });
    expect(parseQuery("woolies greek yoghurt").brand).toBe("woolworths");
    expect(parseQuery("coles")).toMatchObject({ brand: "coles", food: "" });
    expect(parseQuery("chicken breast")).toEqual({ brand: null, food: "chicken breast", branded: "chicken breast" });
  });

  it("doesn't treat a store name inside another word as the store", () => {
    expect(parseQuery("coleslaw").brand).toBeNull();
  });

  it("normalises Australian spellings to USDA's", () => {
    expect(tokens("Greek Yoghurt")).toEqual(["greek", "yogurt"]);
    expect(tokens("Crème fraîche")).toEqual(["creme", "fraiche"]);
  });
});

describe("rankResults", () => {
  const rice = { id: "g", name: "Rice, White, Cooked", generic: true };
  const kirkland = { id: "k", name: "Rotisserie Chicken", brand: "Kirkland Signature", generic: false };
  const tegel = { id: "t", name: "Chicken Breast", brand: "Tegel", generic: false };
  const local = { id: "l", name: "Chicken Breast Fillets", brand: "Coles", generic: false, local: true };
  const chickenGeneric = { id: "c", name: "Chicken Breast, Roasted", generic: true };

  it("puts the asked-for brand first and drops unrelated results", () => {
    const ids = rankResults([rice, chickenGeneric, tegel, kirkland], parseQuery("costco chicken")).map((f) => f.id);
    expect(ids[0]).toBe("k");
    expect(ids).not.toContain("g");
  });

  it("leads with generic foods when no brand is named, and boosts local products", () => {
    const ids = rankResults([tegel, local, chickenGeneric], parseQuery("chicken breast")).map((f) => f.id);
    expect(ids).toEqual(["c", "l", "t"]);
  });

  it("drops duplicates", () => {
    expect(rankResults([tegel, { ...tegel, id: "t2" }], parseQuery("chicken"))).toHaveLength(1);
  });
});

describe("My foods", () => {
  const m = myFoodFromLabel({ id: "1", name: "Protein Bar", brand: "Coles", barcode: "9300601", servingGrams: "60", calories: "220", protein: "20", carbs: "18", fat: "7" });

  it("converts a per-serving label to per 100 g", () => {
    expect(m).toMatchObject({ servingGrams: 60, per100g: { calories: 366.7, protein: 33.3, carbs: 30, fat: 11.7 } });
    const r = myFoodToResult(m);
    expect(r.portions[0]).toEqual({ label: "1 serving (60 g)", grams: 60 });
    expect(toDiaryEntry(r, 1, r.portions[0], {}).calories).toBe(220);
  });

  it("assumes 100 g when no serving size is given", () => {
    expect(myFoodFromLabel({ id: "2", name: "Soup", calories: 80 }).per100g.calories).toBe(80);
  });

  it("is searchable by name, brand or store", () => {
    expect(searchMyFoods([m], "protein b")).toHaveLength(1);
    expect(searchMyFoods([m], "coles bar")).toHaveLength(1);
    expect(searchMyFoods([m], "woolies bar")).toHaveLength(0);
  });
});

it("validates barcodes", () => {
  expect(isValidBarcode("3017620422003")).toBe(true);
  expect(isValidBarcode("12ab")).toBe(false);
  expect(isValidBarcode("")).toBe(false);
});

import { correctSpelling, parseAmount, amountFromQuery, wordMatches, frequentFoods, searchHistory } from "./foodData";

describe("keyword handling", () => {
  it("corrects misspelt food words but leaves brands and ambiguous words alone", () => {
    expect(correctSpelling("chiken brest")).toEqual({ text: "chicken breast", changed: true });
    expect(correctSpelling("kirkland chiken").text).toBe("kirkland chicken");
    expect(correctSpelling("greek yogurt").changed).toBe(false);
    expect(correctSpelling("chobani").changed).toBe(false);
  });

  it("matches typos, plurals and prefixes without false friends", () => {
    expect(wordMatches("chiken", "chicken")).toBe(true);
    expect(wordMatches("eggs", "egg")).toBe(true);
    expect(wordMatches("chick", "chicken")).toBe(true);
    expect(wordMatches("rice", "price")).toBe(false);
    expect(wordMatches("bread", "breast")).toBe(false);
  });

  it("reads amounts typed with the food", () => {
    expect(parseAmount("200g chicken breast")).toEqual({ food: "chicken breast", amount: { grams: 200 } });
    expect(parseAmount("chicken breast 150 g")).toEqual({ food: "chicken breast", amount: { grams: 150 } });
    expect(parseAmount("2 eggs")).toEqual({ food: "eggs", amount: { servings: 2 } });
    expect(parseAmount("1 cup rice").amount).toEqual({ servings: 1, hint: "cup" });
    expect(parseAmount("7up")).toEqual({ food: "7up", amount: null });
    const rice = { portions: [{ label: "1 cup, cooked", grams: 158 }, { label: "1 tbsp", grams: 10 }] };
    expect(amountFromQuery(rice, { servings: 2, hint: "cup" })).toEqual({ quantity: 2, unit: rice.portions[0] });
    expect(amountFromQuery(rice, { grams: 250 }).quantity).toBe(250);
  });
});

describe("history", () => {
  const today = new Date("2026-10-24T12:00:00Z");
  const e = (name, date, extra = {}) => ({ id: name + date, name, date, calories: 100, protein: 1, carbs: 1, fat: 1, ...extra });

  it("lists foods logged at least twice in the last 60 days, most frequent first", () => {
    const diary = [e("Coffee", "2026-10-20"), e("Coffee", "2026-10-21"), e("Coffee", "2026-10-22"), e("Toast", "2026-10-21"), e("Toast", "2026-10-22"), e("Cake", "2026-10-22"), e("Old", "2026-01-01"), e("Old", "2026-01-02")];
    expect(frequentFoods(diary, today).map((f) => f.name)).toEqual(["Coffee", "Toast"]);
  });

  it("finds past entries with typos and reopens them at the last amount", () => {
    const diary = [e("Banana, Raw", "2026-10-01", { grams: 100, amount: "100 g", per100g: { calories: 89, protein: 1, carbs: 23, fat: 0 } }),
      e("Banana, Raw", "2026-10-20", { grams: 150, amount: "150 g", per100g: { calories: 89, protein: 1, carbs: 23, fat: 0 } })];
    const [hit] = searchHistory(diary, "bananna");
    expect(hit).toMatchObject({ history: true, lastGrams: 150, portions: [] });
  });
});
