import { describe, it, expect } from "vitest";
import { waterGoalMl, waterForDate, formatMl } from "./water";
import { isValidWaterEntry } from "./validation";

describe("water", () => {
  it("derives a goal from bodyweight unless one is set", () => {
    expect(waterGoalMl({ weightKg: 80 })).toBe(2750);
    expect(waterGoalMl({ weightKg: 30 })).toBe(1500);
    expect(waterGoalMl({ weightKg: 200 })).toBe(4500);
    expect(waterGoalMl({})).toBe(2500);
    expect(waterGoalMl({ weightKg: 80, waterGoalMl: 3000 })).toBe(3000);
  });

  it("totals one day's entries", () => {
    const entries = [{ date: "2026-10-24", ml: 250 }, { date: "2026-10-24", ml: 500 }, { date: "2026-10-23", ml: 750 }];
    expect(waterForDate(entries, "2026-10-24")).toBe(750);
    expect(waterForDate(undefined, "2026-10-24")).toBe(0);
  });

  it("formats millilitres and litres", () => {
    expect(formatMl(750)).toBe("750 ml");
    expect(formatMl(2000)).toBe("2 L");
    expect(formatMl(1500)).toBe("1.5 L");
    expect(formatMl(2250)).toBe("2.25 L");
  });

  it("validates stored entries", () => {
    expect(isValidWaterEntry({ id: "a", date: "2026-10-24", ml: 250 })).toBe(true);
    expect(isValidWaterEntry({ id: "a", date: "2026-10-24", ml: 0 })).toBe(false);
    expect(isValidWaterEntry({ id: "a", date: "2026-10-24", ml: "250" })).toBe(false);
  });
});
