import { classifyDayAdherence } from "./nutritionMath";

export const QUICK_FOODS = [
  { name: "Chicken Breast (150g)", calories: 248, protein: 46, carbs: 0, fat: 5 },
  { name: "White Rice (1 cup)", calories: 205, protein: 4, carbs: 45, fat: 0 },
  { name: "Whole Eggs (2)", calories: 156, protein: 12, carbs: 1, fat: 11 },
  { name: "Greek Yogurt (200g)", calories: 146, protein: 20, carbs: 8, fat: 4 },
  { name: "Banana", calories: 105, protein: 1, carbs: 27, fat: 0 },
  { name: "Protein Shake", calories: 130, protein: 25, carbs: 4, fat: 2 },
  { name: "Oats (80g)", calories: 300, protein: 10, carbs: 54, fat: 5 },
  { name: "Avocado (half)", calories: 120, protein: 1, carbs: 6, fat: 11 },
];


/* Per-meal macro targets used to steer the nearby-meals search toward the person's goal */
export function mealMacroGuidance(goal, timing) {
  const base = {
    fat_loss: { calories: [350, 500], protein: [35, 50], carbs: [15, 30], fat: [8, 15], rationale: "high protein and lower calorie/fat/carb to support a fat loss goal" },
    muscle_growth: { calories: [600, 900], protein: [40, 60], carbs: [60, 90], fat: [15, 25], rationale: "higher calorie, carb, and fat to support a muscle gain goal" },
    strength: { calories: [550, 750], protein: [40, 55], carbs: [50, 70], fat: [15, 20], rationale: "solid protein and carbs to fuel strength training" },
    general: { calories: [450, 600], protein: [30, 45], carbs: [40, 60], fat: [12, 20], rationale: "balanced macros for general fitness" },
  };
  const g = base[goal] || base.general;
  if (timing === "pre") {
    return { ...g, carbs: [g.carbs[0], Math.round(g.carbs[1] * 1.1)], fat: [Math.max(5, g.fat[0] - 5), Math.round(g.fat[1] * 0.7)], note: "easy to digest before training" };
  }
  return { ...g, protein: [Math.round(g.protein[0] * 1.05), Math.round(g.protein[1] * 1.1)], note: "supports post-training recovery" };
}

/* Picks the "Best Value" nearby-meal option deterministically rather than trusting the model's own
   self-assessment — scores macro fit against the person's target range, distance, and price, so the
   badge means the same thing every time instead of being whatever the AI happened to call out. */
export function scoreBestMeal(places, guidance) {
  if (!places.length) return -1;
  const macroFit = (p) => {
    const ranges = [[p.calories, guidance.calories], [p.protein, guidance.protein], [p.carbs, guidance.carbs], [p.fat, guidance.fat]];
    const scores = ranges.map(([val, [lo, hi]]) => {
      if (val == null) return 0.5;
      if (val >= lo && val <= hi) return 1;
      const span = hi - lo || 1;
      const dist = val < lo ? lo - val : val - hi;
      return Math.max(0, 1 - dist / span);
    });
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };
  const normInverted = (values) => {
    const nums = values.map((v) => (v == null ? null : v));
    const present = nums.filter((v) => v != null);
    if (present.length === 0) return nums.map(() => 0.5);
    const min = Math.min(...present), max = Math.max(...present);
    return nums.map((v) => (v == null ? 0.5 : max === min ? 1 : 1 - (v - min) / (max - min)));
  };
  const distScores = normInverted(places.map((p) => p.distanceKm));
  const priceScores = normInverted(places.map((p) => p.price));
  let bestIdx = 0, bestScore = -Infinity;
  places.forEach((p, i) => {
    const score = macroFit(p) * 0.5 + distScores[i] * 0.25 + priceScores[i] * 0.25;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  });
  return bestIdx;
}

export function weeklyAdherence(nutrition, targets) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const dayFoods = nutrition.filter((n) => n.date === iso);
    const level = classifyDayAdherence(dayFoods, targets);
    days.push({ date: iso, level, weekday: d.toLocaleDateString(undefined, { weekday: "narrow" }) });
  }
  return days;
}

export const ADHERENCE_COLOR = { good: "var(--good)", partial: "var(--warn)", off: "var(--rest)", none: "var(--bg-elev2)" };
export const ADHERENCE_LABEL = { good: "On target", partial: "Partially on target", off: "Off target", none: "Nothing logged" };
