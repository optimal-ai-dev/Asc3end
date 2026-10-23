import React from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { HomeMealIdeas } from "./HomeMealIdeas";
import { WeeklyCheckIn } from "./WeeklyCheckIn";
import { getNutritionTargets } from "../lib/nutritionMath";

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

const profile = { weightKg: 80, heightCm: 180, age: 30, gender: "male", goal: "fat_loss" };

describe("HomeMealIdeas", () => {
  it("renders ideas and logs one with its macros", () => {
    const onAdd = vi.fn();
    const targets = { calories: 2200, protein: 160, carbs: 200, fat: 60 };
    act(() => root.render(<HomeMealIdeas targets={targets} totals={{ calories: 0, protein: 0, carbs: 0, fat: 0 }} onAdd={onAdd} onToggleVegetarian={() => {}} />));
    const logButtons = [...container.querySelectorAll("button")].filter((b) => b.textContent.includes("Log this meal"));
    expect(logButtons.length).toBe(3);
    act(() => logButtons[0].click());
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0].calories).toBeGreaterThan(0);
  });
});

describe("WeeklyCheckIn", () => {
  it("prompts for more data when there's none", () => {
    act(() => root.render(<WeeklyCheckIn profile={profile} nutrition={[]} weightlog={[]} targets={getNutritionTargets(profile)} onUpdateProfile={() => {}} />));
    expect(container.textContent).toContain("0/10 days logged");
  });

  it("stays hidden while a manual override is set", () => {
    const p = { ...profile, macroOverride: { calories: 2500, protein: 180, carbs: 250, fat: 70 } };
    act(() => root.render(<WeeklyCheckIn profile={p} nutrition={[]} weightlog={[]} targets={getNutritionTargets(p)} onUpdateProfile={() => {}} />));
    expect(container.textContent).toBe("");
  });
});
