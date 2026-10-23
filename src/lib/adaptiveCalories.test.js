import { describe, it, expect } from "vitest";
import { computeWeeklyCheckIn, weekStartIso, weightTrendPerDay, MAX_WEEKLY_CHANGE } from "./adaptiveCalories";
import { computeTargets, getNutritionTargets } from "./nutritionMath";

const profile = { weightKg: 80, heightCm: 180, age: 30, gender: "male", goal: "fat_loss" };
const formula = computeTargets(profile).calories;

// Builds 21 days of logs ending the Sunday before `today` (a Wednesday).
const TODAY = "2026-10-21"; // Wednesday; week starts Mon 2026-10-19
function isoDaysBefore(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function history({ intake, startWeight, kgPerWeek, days = 21 }) {
  const nutrition = [], weightlog = [];
  for (let i = 1; i <= days; i++) {
    const date = isoDaysBefore("2026-10-19", i);
    nutrition.push({ date, calories: intake });
    if (i % 2 === 0) weightlog.push({ date, weight: startWeight + (kgPerWeek / 7) * (days - i) });
  }
  return { nutrition, weightlog };
}

describe("weekStartIso", () => {
  it("returns the Monday of the week", () => {
    expect(weekStartIso("2026-10-21")).toBe("2026-10-19");
    expect(weekStartIso("2026-10-19")).toBe("2026-10-19");
    expect(weekStartIso("2026-10-25")).toBe("2026-10-19");
  });
});

describe("weightTrendPerDay", () => {
  it("fits a straight-line slope", () => {
    expect(weightTrendPerDay([{ day: 0, weight: 80 }, { day: 10, weight: 79 }])).toBeCloseTo(-0.1);
    expect(weightTrendPerDay([{ day: 0, weight: 80 }])).toBe(0);
  });
});

describe("computeWeeklyCheckIn", () => {
  it("asks for more data before there are enough logs", () => {
    const r = computeWeeklyCheckIn({ profile, nutrition: [], weightlog: [], today: TODAY });
    expect(r.status).toBe("need_data");
    expect(r.intakeDays).toBe(0);
  });

  it("lowers calories when a cut has stalled (eating at formula target, weight flat)", () => {
    const { nutrition, weightlog } = history({ intake: formula, startWeight: 80, kgPerWeek: 0 });
    const r = computeWeeklyCheckIn({ profile, nutrition, weightlog, today: TODAY });
    expect(r.status).toBe("ready");
    expect(r.change).toBeLessThan(0);
    expect(r.change).toBeGreaterThanOrEqual(-MAX_WEEKLY_CHANGE);
  });

  it("raises calories when losing much faster than planned", () => {
    const { nutrition, weightlog } = history({ intake: formula, startWeight: 82, kgPerWeek: -1.2 });
    const r = computeWeeklyCheckIn({ profile, nutrition, weightlog, today: TODAY });
    expect(r.status).toBe("ready");
    expect(r.change).toBeGreaterThan(0);
    expect(r.weeklyWeightChangeKg).toBeCloseTo(-1.2, 1);
  });

  it("keeps calories about the same when losing ~0.45 kg/week (the planned 500 kcal deficit)", () => {
    const { nutrition, weightlog } = history({ intake: formula, startWeight: 81, kgPerWeek: -(500 * 7) / 7700 });
    const r = computeWeeklyCheckIn({ profile, nutrition, weightlog, today: TODAY });
    expect(Math.abs(r.change)).toBeLessThanOrEqual(30);
  });

  it("is stable within a week — logging today doesn't change the recommendation", () => {
    const h = history({ intake: formula, startWeight: 80, kgPerWeek: 0 });
    const before = computeWeeklyCheckIn({ profile, ...h, today: TODAY });
    const after = computeWeeklyCheckIn({ profile, nutrition: [...h.nutrition, { date: TODAY, calories: 5000 }], weightlog: [...h.weightlog, { date: TODAY, weight: 90 }], today: "2026-10-24" });
    expect(after).toEqual(before);
  });

  it("ignores half-logged days and never goes below the safety floor", () => {
    const small = { weightKg: 50, heightCm: 155, age: 55, gender: "female", goal: "fat_loss" };
    const { nutrition, weightlog } = history({ intake: 1000, startWeight: 50, kgPerWeek: 0.3 });
    let p = small;
    for (let i = 0; i < 10; i++) {
      const r = computeWeeklyCheckIn({ profile: p, nutrition, weightlog, today: TODAY });
      if (r.status !== "ready") break;
      expect(r.calories).toBeGreaterThanOrEqual(1200);
      p = { ...p, adaptiveCalories: { calories: r.calories, goal: p.goal, weekOf: r.weekOf } };
    }
  });
});

describe("adaptive calories in getNutritionTargets", () => {
  it("uses accepted adaptive calories and recomputes macros from them", () => {
    const t = getNutritionTargets({ ...profile, adaptiveCalories: { calories: 2000, goal: "fat_loss", weekOf: "2026-10-19" } });
    expect(t.calories).toBe(2000);
    expect(t.source).toBe("adaptive");
    expect(t.protein).toBe(160);
    expect(t.fat).toBe(Math.round((2000 * 0.25) / 9));
  });

  it("ignores adaptive calories saved under a different goal", () => {
    const t = getNutritionTargets({ ...profile, goal: "muscle_growth", adaptiveCalories: { calories: 2000, goal: "fat_loss" } });
    expect(t.source).toBe("calculated");
    expect(t.calories).not.toBe(2000);
  });

  it("a manual override still wins over adaptive calories", () => {
    const override = { calories: 2500, protein: 180, carbs: 250, fat: 70 };
    const t = getNutritionTargets({ ...profile, macroOverride: override, adaptiveCalories: { calories: 2000, goal: "fat_loss" } });
    expect(t.calories).toBe(2500);
    expect(t.source).toBe("manual");
  });
});
