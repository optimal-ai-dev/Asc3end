// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
function render(el) { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); act(() => { root.render(el); }); return { container: host }; }
const q = (label) => host.querySelector(`[aria-label="${label}"]`);
const byText = (t) => [...host.querySelectorAll("button")].find((b) => b.textContent.includes(t));
const alertText = () => host.querySelector("[role=alert]")?.textContent || "";
function change(el, value) { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; act(() => { set.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); }); }
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
afterEach(() => { act(() => root?.unmount()); host?.remove(); });
import FoodLogSheet, { MacroConsistencyNote } from "./FoodLogSheet";
import { sanitizeIdeas } from "./MealsNearYou";

const range = (a, b) => [a, b];

describe("sanitizeIdeas (AI order suggestions)", () => {
  const ids = new Set(["node/1"]);
  const good = { venueId: "node/1", item: "Grilled chicken burrito bowl", calories: range(600, 800), protein: range(40, 55), carbs: range(60, 80), fat: range(15, 25), portionAssumption: "one regular bowl", confidence: "high", reason: "x" };

  it("keeps ranged estimates for known venues only, and never claims more than medium confidence", () => {
    const out = sanitizeIdeas({ ideas: [good, { ...good, venueId: "node/999" }] }, ids);
    expect(Object.keys(out)).toEqual(["node/1"]);
    expect(out["node/1"].confidence).toBe("low");
    expect(out["node/1"].mid.calories).toBe(700);
    expect(out["node/1"].portionAssumption).toBe("one regular bowl");
  });

  it("drops ideas with missing/invalid ranges, blank items or invented venues, and tolerates junk", () => {
    expect(sanitizeIdeas({ ideas: [{ ...good, calories: undefined }] }, ids)).toEqual({});
    expect(sanitizeIdeas({ ideas: [{ ...good, item: "  " }] }, ids)).toEqual({});
    expect(sanitizeIdeas({ ideas: [null, 5, "x"] }, ids)).toEqual({});
    expect(sanitizeIdeas(null, ids)).toEqual({});
    expect(sanitizeIdeas({ ideas: "nope" }, ids)).toEqual({});
  });

  it("flags an estimate whose calories disagree with its macros", () => {
    const out = sanitizeIdeas({ ideas: [{ ...good, calories: range(850, 850), protein: range(55, 55), carbs: range(72, 72), fat: range(24, 24) }] }, ids);
    expect(out["node/1"].consistency.status).toBe("inconsistent");
  });
});

describe("FoodLogSheet", () => {
  it("logs nothing until confirmed, and passes the edited values + estimate flag through", () => {
    const onConfirm = vi.fn();
    render(<FoodLogSheet initial={{ name: "Burger", calories: 850, protein: 55, carbs: 72, fat: 24, estimated: true, source: "ai_estimate" }} onConfirm={onConfirm} onCancel={() => {}} />);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(alertText()).toMatch(/724/); // 850 kcal vs 55P/72C/24F
    change(q("Calories"), "724");
    click(byText("Add to log"));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ name: "Burger", calories: 724, protein: 55, estimated: true, source: "ai_estimate" }));
  });

  it("refuses a blank name or non-numeric calories instead of logging 0", () => {
    const onConfirm = vi.fn();
    render(<FoodLogSheet initial={{ name: "", calories: "", protein: "", carbs: "", fat: "" }} onConfirm={onConfirm} onCancel={() => {}} />);
    click(byText("Add to log"));
    expect(onConfirm).not.toHaveBeenCalled();
    change(q("Food name"), "Oats");
    change(q("Calories"), "abc");
    click(byText("Add to log"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(alertText()).toMatch(/calories/i);
  });

  it("MacroConsistencyNote stays quiet when the numbers agree", () => {
    const { container } = render(<MacroConsistencyNote values={{ calories: 724, protein: 55, carbs: 72, fat: 24 }} />);
    expect(container.textContent).toBe("");
  });
});
