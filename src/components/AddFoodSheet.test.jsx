import React from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";

vi.mock("../lib/foodSearchClient", () => ({
  searchFoods: vi.fn(async () => ({ partial: false, results: [{
    id: "fdc:1", source: "usda", name: "Banana, Raw", brand: null, generic: true,
    per100g: { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 },
    portions: [{ label: "1 medium", grams: 118 }, { label: "1 cup, sliced", grams: 150 }],
  }] })),
  lookupBarcode: vi.fn(),
}));

vi.mock("../lib/labelReader", () => ({
  readNutritionLabel: vi.fn(async () => ({ name: "Greek Yoghurt", brand: "Chobani", servingGrams: "170", calories: "100", protein: "17", carbs: "6", fat: "0.7", servingUnit: "g", basis: "per serving", energyKj: 418, checks: [] })),
}));

import { AddFoodSheet, hasValidCheckDigit } from "./AddFoodSheet";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const setValue = (el, value) => {
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
};

describe("AddFoodSheet", () => {
  it("searches, picks a serving size and adds the scaled food to the chosen meal", async () => {
    const onAdd = vi.fn(), onClose = vi.fn();
    act(() => root.render(<AddFoodSheet initialMeal="breakfast" onAdd={onAdd} onClose={onClose} />));
    act(() => setValue(container.querySelector('input[aria-label="Search foods"]'), "banana"));
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    const row = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Banana, Raw"));
    expect(row.textContent).toContain("1 medium · 105 kcal");
    act(() => row.click());

    act(() => setValue(container.querySelector("#food-unit"), "1"));
    // Switching unit keeps the weight: 118 g is 0.79 cups.
    expect(container.querySelector("#food-qty").value).toBe("0.79");
    act(() => setValue(container.querySelector("#food-qty"), "2"));
    act(() => [...container.querySelectorAll("button")].find((b) => b.textContent === "Lunch").click());
    act(() => [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Add to Lunch")).click());

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toMatchObject({ meal: "lunch", name: "Banana, Raw", grams: 300, calories: 267, amount: "2 × 1 cup, sliced" });
    expect(onClose).toHaveBeenCalled();
  });

  it("adds a custom food", () => {
    const onAdd = vi.fn();
    act(() => root.render(<AddFoodSheet initialMeal="snacks" onAdd={onAdd} onClose={() => {}} />));
    act(() => [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Custom")).click());
    act(() => setValue(container.querySelector('input[aria-label="Food name"]'), "Lasagne"));
    act(() => setValue(container.querySelector('input[aria-label="kcal"]'), "450"));
    act(() => [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Add to Snacks")).click());
    expect(onAdd.mock.calls[0][0]).toMatchObject({ meal: "snacks", name: "Lasagne", calories: 450 });
  });
});

describe("AddFoodSheet My foods", () => {
  it("finds saved products by name before the databases answer", () => {
    const myFoods = [{ id: "m1", name: "Rotisserie Chicken", brand: "Kirkland Signature", servingGrams: 100, per100g: { calories: 190, protein: 26, carbs: 0, fat: 9 } }];
    act(() => root.render(<AddFoodSheet initialMeal="dinner" onAdd={() => {}} onClose={() => {}} myFoods={myFoods} />));
    act(() => setValue(container.querySelector('input[aria-label="Search foods"]'), "costco chicken"));
    expect(container.textContent).toContain("Rotisserie Chicken");
    expect(container.textContent).toContain("Kirkland SignatureRotisserie ChickenMy foods · ");
  });

  it("saves a custom food to My foods", () => {
    const onSaveMyFood = vi.fn(), onAdd = vi.fn();
    act(() => root.render(<AddFoodSheet initialMeal="snacks" onAdd={onAdd} onClose={() => {}} onSaveMyFood={onSaveMyFood} />));
    act(() => [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Custom")).click());
    act(() => setValue(container.querySelector('input[aria-label="Food name"]'), "Protein Bar"));
    act(() => setValue(container.querySelector('input[aria-label="Serving size in grams"]'), "60"));
    act(() => setValue(container.querySelector('input[aria-label="kcal"]'), "220"));
    act(() => [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Add to Snacks")).click());
    expect(onSaveMyFood.mock.calls[0][0]).toMatchObject({ name: "Protein Bar", servingGrams: 60 });
    expect(onAdd.mock.calls[0][0]).toMatchObject({ name: "Protein Bar", calories: 220, grams: 60 });
  });
});

describe("AddFoodSheet keyword handling", () => {
  it("corrects spelling, reads an amount from the query, and finds past entries instantly", async () => {
    const onAdd = vi.fn();
    const diary = [{ id: "d1", date: "2026-10-20", name: "Banana, Raw", calories: 105, protein: 1.3, carbs: 26.9, fat: 0.4, grams: 118, amount: "1 medium", per100g: { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 } }];
    act(() => root.render(<AddFoodSheet initialMeal="breakfast" onAdd={onAdd} onClose={() => {}} diary={diary} />));
    act(() => setValue(container.querySelector('input[aria-label="Search foods"]'), "200g bananna"));
    expect(container.textContent).toContain("Showing results for banana");
    expect(container.textContent).toContain("Logged before");
    const row = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Logged before"));
    act(() => row.click());
    expect(container.querySelector("#food-qty").value).toBe("200");
    act(() => [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Add to Breakfast")).click());
    expect(onAdd.mock.calls[0][0]).toMatchObject({ grams: 200, calories: 178 });
  });

  it("offers a way out under every search, carrying the typed name into Custom", () => {
    act(() => root.render(<AddFoodSheet initialMeal="lunch" onAdd={() => {}} onClose={() => {}} />));
    act(() => setValue(container.querySelector('input[aria-label="Search foods"]'), "nan's curry"));
    act(() => [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Type it in")).click());
    expect(container.querySelector('input[aria-label="Food name"]').value).toBe("nan's curry");
  });

  it("fills the custom form from a label photo", async () => {
    act(() => root.render(<AddFoodSheet initialMeal="lunch" onAdd={() => {}} onClose={() => {}} />));
    act(() => [...container.querySelectorAll("button")].find((b) => b.textContent.includes("Custom")).click());
    const input = container.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", { value: [new File(["x"], "label.jpg", { type: "image/jpeg" })] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.querySelector('input[aria-label="Food name"]').value).toBe("Greek Yoghurt");
    expect(container.querySelector('input[aria-label="Serving size in grams"]').value).toBe("170");
    expect(container.querySelector("[data-testid=label-review]").textContent).toContain("418 kJ = 100 kcal");
  });
});

describe("hasValidCheckDigit", () => {
  it("accepts real EAN-13, UPC-A and EAN-8 codes and rejects misreads", () => {
    expect(hasValidCheckDigit("3017620422003")).toBe(true); // Nutella EAN-13
    expect(hasValidCheckDigit("9300633603649")).toBe(true);
    expect(hasValidCheckDigit("051500255162")).toBe(true); // UPC-A
    expect(hasValidCheckDigit("96385074")).toBe(true); // EAN-8
    expect(hasValidCheckDigit("3017620422004")).toBe(false);
    expect(hasValidCheckDigit("12345")).toBe(false);
  });
});
