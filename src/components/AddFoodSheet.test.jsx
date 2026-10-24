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

import { AddFoodSheet } from "./AddFoodSheet";

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
    expect(container.textContent).toContain("My foods · Kirkland Signature");
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
