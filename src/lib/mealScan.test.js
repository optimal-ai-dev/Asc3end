import { describe, it, expect } from "vitest";
import {
  SCAN_PROMPT, parseScanResult, normalizeScanItem, mealTotals, setPieces, setGramsPerPiece, setTotalGrams,
  parseItemEstimate, renameItem, buildRefinePrompt, mergeRefined, toDiaryEntries, itemNutrients,
} from "./mealScan";

const chops = { name: "Chicken thighs", countable: true, pieces: 2, pieceLabel: "thigh", gramsPerPiece: 120, estimatedGrams: 240, caloriesPer100g: 209, proteinPer100g: 26, carbsPer100g: 0, fatPer100g: 10.9, confidence: "medium", question: "How many thighs did you have?" };
const rice = { name: "White rice", countable: false, pieces: null, gramsPerPiece: null, estimatedGrams: 180, caloriesPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28, fatPer100g: 0.3, confidence: "high", question: "Roughly how many grams of rice was this?" };

describe("SCAN_PROMPT", () => {
  it("asks for every food on the plate and a follow-up question for each", () => {
    expect(SCAN_PROMPT).toMatch(/EVERY separate food/);
    expect(SCAN_PROMPT).toMatch(/"items":\[/);
    expect(SCAN_PROMPT).toMatch(/question/);
  });
});

describe("parseScanResult", () => {
  it("returns one item per food in the photo", () => {
    const items = parseScanResult({ items: [chops, rice, { name: "Broccoli", estimatedGrams: 80, caloriesPer100g: 35 }] });
    expect(items.map((i) => i.name)).toEqual(["Chicken thighs", "White rice", "Broccoli"]);
    expect(new Set(items.map((i) => i.id)).size).toBe(3);
  });

  it("keeps piece counts for countable foods and grams agree with them", () => {
    const [item] = parseScanResult({ items: [chops] });
    expect(item).toMatchObject({ pieces: 2, gramsPerPiece: 120, grams: 240, pieceLabel: "thigh", question: "How many thighs did you have?" });
  });

  it("works out the per-piece weight when only the total is given", () => {
    const item = normalizeScanItem({ ...chops, gramsPerPiece: null, estimatedGrams: 300 });
    expect(item.gramsPerPiece).toBe(150);
    expect(item.grams).toBe(300);
  });

  it("still reads the old single-food answer", () => {
    const items = parseScanResult({ name: "Pasta", estimatedGrams: 250, caloriesPer100g: 160 });
    expect(items).toHaveLength(1);
    expect(items[0].grams).toBe(250);
  });

  it("drops nameless items and clamps nonsense numbers", () => {
    const items = parseScanResult({ items: [{ name: "" }, { name: "Soup", estimatedGrams: 99999, caloriesPer100g: -5 }] });
    expect(items).toHaveLength(1);
    expect(items[0].grams).toBe(3000);
    expect(items[0].per100g.calories).toBe(0);
  });

  it("returns nothing for junk", () => {
    expect(parseScanResult(null)).toEqual([]);
    expect(parseScanResult({ items: "nope" })).toEqual([]);
  });
});

describe("editing an item", () => {
  const [item] = parseScanResult({ items: [chops] });

  it("changing the number of pieces rescales grams and macros", () => {
    const three = setPieces(item, 3);
    expect(three.grams).toBe(360);
    expect(itemNutrients(three).calories).toBe(Math.round(209 * 3.6));
  });

  it("changing grams per piece keeps the count", () => {
    expect(setGramsPerPiece(item, 150)).toMatchObject({ pieces: 2, grams: 300 });
  });

  it("typing total grams updates the per-piece weight", () => {
    expect(setTotalGrams(item, 200)).toMatchObject({ pieces: 2, grams: 200, gramsPerPiece: 100 });
  });

  it("renaming swaps in the new food's macros and clears the question", () => {
    const estimate = parseItemEstimate({ caloriesPer100g: 231, proteinPer100g: 25, carbsPer100g: 0, fatPer100g: 14, gramsPerPiece: 150 });
    const pork = renameItem(item, "Pork chops", estimate);
    expect(pork).toMatchObject({ name: "Pork chops", grams: 240, pieces: 2, question: "", per100g: { calories: 231, fat: 14 } });
    expect(pork.id).toBe(item.id);
  });

  it("an empty estimate is ignored", () => {
    expect(parseItemEstimate({ caloriesPer100g: 0 })).toBeNull();
  });
});

describe("mealTotals", () => {
  it("adds up every item", () => {
    const items = parseScanResult({ items: [chops, rice] });
    const t = mealTotals(items);
    expect(t.calories).toBe(Math.round(209 * 2.4) + Math.round(130 * 1.8));
    expect(t.protein).toBeCloseTo(26 * 2.4 + 2.7 * 1.8, 1);
  });
});

describe("refining with the person's notes", () => {
  it("sends the corrected list and the notes", () => {
    const items = parseScanResult({ items: [chops, rice] });
    const prompt = buildRefinePrompt(items, "cooked in butter");
    expect(prompt).toContain('"name":"Chicken thighs"');
    expect(prompt).toContain('"pieces":2');
    expect(prompt).toContain("cooked in butter");
  });

  it("keeps ids for foods that are still there", () => {
    const items = parseScanResult({ items: [chops, rice] });
    const next = mergeRefined(items, { items: [{ ...rice, estimatedGrams: 90 }, { name: "Butter", estimatedGrams: 10, caloriesPer100g: 717 }] });
    expect(next.map((i) => i.name)).toEqual(["White rice", "Butter"]);
    expect(next[0].id).toBe(items[1].id);
    expect(next[0].grams).toBe(90);
  });
});

describe("toDiaryEntries", () => {
  it("logs one diary entry per food, with grams and per-100 g kept for later edits", () => {
    let n = 0;
    const items = [...parseScanResult({ items: [chops, rice] }), { ...parseScanResult({ items: [rice] })[0], grams: 0 }];
    const entries = toDiaryEntries(items, { id: () => `id${n++}`, date: "2026-11-12" });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ id: "id0", date: "2026-11-12", name: "Chicken thighs (2 thighs, 240g)", grams: 240, amount: "240 g", calories: Math.round(209 * 2.4) });
    expect(entries[1].name).toBe("White rice (180g)");
    expect(entries[1].per100g.calories).toBe(130);
  });
});
