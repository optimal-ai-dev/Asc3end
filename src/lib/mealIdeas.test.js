import { describe, it, expect } from "vitest";
import { suggestHomeMeals, mealSlotsForHour, HOME_MEALS } from "./mealIdeas";

describe("suggestHomeMeals", () => {
  it("says the day is done when there's almost nothing left", () => {
    expect(suggestHomeMeals({ calories: 100, protein: 5, carbs: 10, fat: 2 }, { hour: 13 })).toEqual({ status: "done", ideas: [] });
    expect(suggestHomeMeals({ calories: -300, protein: 0, carbs: 0, fat: 0 }, { hour: 13 }).status).toBe("done");
  });

  it("is deterministic for the same inputs", () => {
    const r = { calories: 700, protein: 50, carbs: 70, fat: 20 };
    expect(suggestHomeMeals(r, { hour: 13 })).toEqual(suggestHomeMeals(r, { hour: 13 }));
  });

  it("returns the requested number of ideas, all within the slot for the time of day", () => {
    const { ideas } = suggestHomeMeals({ calories: 900, protein: 60, carbs: 90, fat: 30 }, { hour: 8, count: 4 });
    expect(ideas).toHaveLength(4);
    for (const m of ideas) expect(["breakfast", "snack"]).toContain(m.slot);
  });

  it("only suggests snacks when the remaining budget is small", () => {
    const { ideas } = suggestHomeMeals({ calories: 280, protein: 25, carbs: 30, fat: 8 }, { hour: 13 });
    expect(ideas.length).toBeGreaterThan(0);
    for (const m of ideas) expect(m.slot).toBe("snack");
  });

  it("does not blow through the remaining calories", () => {
    const r = { calories: 450, protein: 40, carbs: 40, fat: 12 };
    for (const m of suggestHomeMeals(r, { hour: 13 }).ideas) expect(m.calories).toBeLessThanOrEqual(r.calories * 1.1);
  });

  it("favors protein-dense meals when protein is what's missing", () => {
    const { ideas } = suggestHomeMeals({ calories: 500, protein: 60, carbs: 20, fat: 10 }, { hour: 13 });
    const density = (m) => (m.protein * 4) / m.calories;
    expect(density(ideas[0])).toBeGreaterThan(0.3);
  });

  it("respects the vegetarian filter", () => {
    const { ideas } = suggestHomeMeals({ calories: 800, protein: 50, carbs: 90, fat: 25 }, { hour: 19, vegetarian: true, count: 5 });
    for (const m of ideas) expect(m.veg).toBe(true);
  });

  it("scales macros together with the portion", () => {
    const { ideas } = suggestHomeMeals({ calories: 1400, protein: 110, carbs: 140, fat: 40 }, { hour: 13 });
    for (const m of ideas) {
      const base = HOME_MEALS.find((x) => x.id === m.id);
      expect(m.calories).toBe(Math.round(base.calories * m.scale));
      expect(m.protein).toBe(Math.round(base.protein * m.scale));
    }
  });
});

describe("mealSlotsForHour", () => {
  it("maps time of day to sensible meal types", () => {
    expect(mealSlotsForHour(7)).toContain("breakfast");
    expect(mealSlotsForHour(13)).toContain("main");
    expect(mealSlotsForHour(22)).toEqual(["snack"]);
  });
});

describe("HOME_MEALS library", () => {
  it("has internally consistent macros (within 15% of 4/4/9 kcal)", () => {
    for (const m of HOME_MEALS) {
      const fromMacros = m.protein * 4 + m.carbs * 4 + m.fat * 9;
      expect(Math.abs(fromMacros - m.calories) / m.calories, m.name).toBeLessThan(0.15);
    }
  });
});
