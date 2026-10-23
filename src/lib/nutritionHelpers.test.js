import { describe, it, expect } from "vitest";
import { defaultMealForHour, groupByMeal } from "./nutritionHelpers";

describe("defaultMealForHour", () => {
  it("maps the time of day to a diary section", () => {
    expect(defaultMealForHour(7)).toBe("breakfast");
    expect(defaultMealForHour(12)).toBe("lunch");
    expect(defaultMealForHour(16)).toBe("snacks");
    expect(defaultMealForHour(19)).toBe("dinner");
    expect(defaultMealForHour(23)).toBe("snacks");
  });
});

describe("groupByMeal", () => {
  it("files entries by meal and keeps meal-less legacy entries under other", () => {
    const g = groupByMeal([{ id: "a", meal: "lunch" }, { id: "b" }, { id: "c", meal: "bogus" }]);
    expect(g.lunch.map((f) => f.id)).toEqual(["a"]);
    expect(g.other.map((f) => f.id)).toEqual(["b", "c"]);
    expect(g.breakfast).toEqual([]);
  });
});
