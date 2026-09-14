import { describe, it, expect } from "vitest";
import { weeklyAdherence } from "./App.jsx";

function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const targets = { calories: 2000, protein: 150, carbs: 200, fat: 60 };

describe("weeklyAdherence", () => {
  it("returns exactly 7 days, oldest first, ending today", () => {
    const days = weeklyAdherence([], targets);
    expect(days).toHaveLength(7);
    expect(days[6].date).toBe(daysAgoIso(0));
    expect(days[0].date).toBe(daysAgoIso(6));
  });

  it("marks a day with no logged food as 'none', not 'off'", () => {
    const days = weeklyAdherence([], targets);
    expect(days.every((d) => d.level === "none")).toBe(true);
  });

  it("marks a day within the calorie band and with enough protein as 'good'", () => {
    const nutrition = [{ date: daysAgoIso(0), calories: 2000, protein: 150, carbs: 200, fat: 60 }];
    const days = weeklyAdherence(nutrition, targets);
    expect(days[6].level).toBe("good");
  });

  it("does not count hitting calories on low protein as 'good'", () => {
    const nutrition = [{ date: daysAgoIso(0), calories: 2000, protein: 40, carbs: 300, fat: 80 }];
    const days = weeklyAdherence(nutrition, targets);
    expect(days[6].level).not.toBe("good");
  });

  it("marks a day moderately over/under target as 'partial'", () => {
    const nutrition = [{ date: daysAgoIso(0), calories: 2500, protein: 150, carbs: 200, fat: 60 }];
    const days = weeklyAdherence(nutrition, targets);
    expect(days[6].level).toBe("partial");
  });

  it("marks a day wildly over target as 'off'", () => {
    const nutrition = [{ date: daysAgoIso(0), calories: 4000, protein: 150, carbs: 400, fat: 150 }];
    const days = weeklyAdherence(nutrition, targets);
    expect(days[6].level).toBe("off");
  });

  it("sums multiple entries logged the same day before judging adherence", () => {
    const nutrition = [
      { date: daysAgoIso(0), calories: 1000, protein: 75, carbs: 100, fat: 30 },
      { date: daysAgoIso(0), calories: 1000, protein: 75, carbs: 100, fat: 30 },
    ];
    const days = weeklyAdherence(nutrition, targets);
    expect(days[6].level).toBe("good");
  });

  it("ignores food logged outside the 7-day window", () => {
    const nutrition = [{ date: daysAgoIso(10), calories: 2000, protein: 150, carbs: 200, fat: 60 }];
    const days = weeklyAdherence(nutrition, targets);
    expect(days.every((d) => d.level === "none")).toBe(true);
  });
});
