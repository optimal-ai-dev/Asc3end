import React from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
vi.mock("../lib/supabase", () => ({ supabase: {} }));
import { act } from "react";
import { MealScanReview } from "./MealScanReview";
import { parseScanResult } from "../lib/mealScan";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const scan = () => parseScanResult({ items: [
  { name: "Chicken thighs", countable: true, pieces: 2, pieceLabel: "thigh", gramsPerPiece: 120, caloriesPer100g: 209, proteinPer100g: 26, carbsPer100g: 0, fatPer100g: 11, confidence: "low", question: "Is this chicken thigh or pork chop?" },
  { name: "White rice", estimatedGrams: 180, caloriesPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28, fatPer100g: 0.3, question: "Roughly how many grams of rice was this?" },
] });

const setValue = (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const button = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent.includes(text) || b.getAttribute("aria-label") === text);
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("MealScanReview", () => {
  it("shows every food found, with the AI's question for each", () => {
    act(() => root.render(<MealScanReview initialItems={scan()} ask={vi.fn()} onAddAll={vi.fn()} onRescan={vi.fn()} />));
    expect(container.querySelectorAll('[data-testid="scan-item"]').length).toBe(2);
    expect(container.textContent).toContain("Found 2 foods on your plate");
    expect(container.textContent).toContain("Is this chicken thigh or pork chop?");
    expect(container.textContent).toContain("Roughly how many grams of rice was this?");
  });

  it("changing the piece count updates the totals", () => {
    act(() => root.render(<MealScanReview initialItems={scan()} ask={vi.fn()} onAddAll={vi.fn()} onRescan={vi.fn()} />));
    const kcal = () => container.querySelector('[data-testid="meal-totals"]').textContent;
    expect(kcal()).toContain(String(Math.round(209 * 2.4) + Math.round(130 * 1.8)));
    act(() => button("More thighs").click());
    expect(container.querySelector('[data-testid="piece-count"]').textContent).toBe("3");
    expect(kcal()).toContain(String(Math.round(209 * 3.6) + Math.round(130 * 1.8)));
  });

  it("renaming an item looks up the new food's macros", async () => {
    const ask = vi.fn().mockResolvedValue('{"caloriesPer100g":231,"proteinPer100g":25,"carbsPer100g":0,"fatPer100g":14,"gramsPerPiece":150}');
    const onAddAll = vi.fn();
    act(() => root.render(<MealScanReview initialItems={scan()} ask={ask} onAddAll={onAddAll} onRescan={vi.fn()} />));
    const nameInput = container.querySelector('input[aria-label="Food name"]');
    act(() => setValue(nameInput, "Pork chops"));
    act(() => { nameInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    await flush();
    expect(ask).toHaveBeenCalledWith(expect.stringContaining('"Pork chops"'), 200);
    expect(container.textContent).not.toContain("Is this chicken thigh or pork chop?");
    act(() => button("Add meal to log").click());
    const [items] = onAddAll.mock.calls[0];
    expect(items[0]).toMatchObject({ name: "Pork chops", pieces: 2, grams: 240, per100g: { calories: 231 } });
  });

  it("sends the person's notes back to the AI and shows the updated meal", async () => {
    const ask = vi.fn().mockResolvedValue(JSON.stringify({ items: [
      { name: "White rice", estimatedGrams: 90, caloriesPer100g: 130 },
      { name: "Butter", estimatedGrams: 10, caloriesPer100g: 717, question: "" },
    ] }));
    act(() => root.render(<MealScanReview initialItems={scan()} ask={ask} onAddAll={vi.fn()} onRescan={vi.fn()} />));
    act(() => setValue(container.querySelector('textarea[aria-label="Notes for the AI"]'), "no chicken, half the rice, cooked in butter"));
    await act(async () => { button("Update my meal").click(); });
    await flush();
    expect(ask.mock.calls[0][0]).toContain("half the rice");
    const names = [...container.querySelectorAll('input[aria-label="Food name"]')].map((i) => i.value);
    expect(names).toEqual(["White rice", "Butter"]);
  });

  it("removes an item", () => {
    act(() => root.render(<MealScanReview initialItems={scan()} ask={vi.fn()} onAddAll={vi.fn()} onRescan={vi.fn()} />));
    act(() => button("Remove White rice").click());
    expect(container.querySelectorAll('[data-testid="scan-item"]').length).toBe(1);
  });
});

describe("MealScanReview on the Free plan", () => {
  it("shows how many free scans are left and logs the meal before upgrading", () => {
    const onUpgrade = vi.fn();
    act(() => root.render(<MealScanReview initialItems={scan()} ask={vi.fn()} onAddAll={vi.fn()} onRescan={vi.fn()} freeScansLeft={3} onUpgrade={onUpgrade} />));
    expect(container.querySelector('[data-testid="free-scans-left"]').textContent).toContain("3 of 5 free scans left this month");
    act(() => button("Upgrade").click());
    expect(onUpgrade).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ name: "White rice" })]));
  });

  it("hides the banner for Asc3end+", () => {
    act(() => root.render(<MealScanReview initialItems={scan()} ask={vi.fn()} onAddAll={vi.fn()} onRescan={vi.fn()} />));
    expect(container.querySelector('[data-testid="free-scans-left"]')).toBeNull();
  });
});
