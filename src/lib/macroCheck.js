// Calorie / macro consistency. Macros carry energy: 4 kcal per gram of protein and carbohydrate,
// 9 per gram of fat (Atwater factors), 7 per gram of alcohol. A food whose stated calories are far
// from what its own macros add up to is internally inconsistent — the audit found an 850 kcal burger
// with 55 g protein, 72 g carbs and 24 g fat, which add up to about 724 kcal.
//
// This never rewrites a value silently. It reports the difference, whether it is plausibly just
// rounding / fibre / alcohol, and offers the arithmetic value as a suggestion the athlete can accept
// or ignore. Unknown values stay unknown: a missing macro is "incomplete", never treated as 0.

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9, alcohol: 7 };

const num = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function atwaterKcal({ protein, carbs, fat, alcohol = 0 }) {
  return Math.round(protein * KCAL_PER_G.protein + carbs * KCAL_PER_G.carbs + fat * KCAL_PER_G.fat + (num(alcohol) || 0) * KCAL_PER_G.alcohol);
}

/** Tolerances: labels round every figure and fibre/sugar-alcohols carry less than 4 kcal/g, so some
 *  gap is normal. Within `ok` it is consistent; within `minor` it is shown as a gentle note. */
export const TOLERANCE = { ok: { abs: 40, pct: 0.08 }, minor: { abs: 60, pct: 0.12 } };

/**
 * @param {{calories:any, protein:any, carbs:any, fat:any, alcohol?:any}} v
 * @returns {{ status: "consistent"|"minor"|"inconsistent"|"incomplete", computedKcal: number|null, statedKcal: number|null,
 *            diffKcal: number|null, diffPct: number|null, message: string, suggestedCalories: number|null }}
 */
export function checkMacroConsistency(v = {}) {
  const calories = num(v.calories), protein = num(v.protein), carbs = num(v.carbs), fat = num(v.fat);
  if (calories === null || protein === null || carbs === null || fat === null) {
    return { status: "incomplete", computedKcal: null, statedKcal: calories, diffKcal: null, diffPct: null, suggestedCalories: null, message: "Enter calories, protein, carbs and fat to check that they agree." };
  }
  if (calories < 0 || protein < 0 || carbs < 0 || fat < 0) {
    return { status: "inconsistent", computedKcal: null, statedKcal: calories, diffKcal: null, diffPct: null, suggestedCalories: null, message: "Nutrition values can't be negative." };
  }
  const computedKcal = atwaterKcal({ protein, carbs, fat, alcohol: v.alcohol });
  const diffKcal = calories - computedKcal;
  const base = Math.max(calories, computedKcal, 1);
  const diffPct = Math.abs(diffKcal) / base;
  const within = (t) => Math.abs(diffKcal) <= Math.max(t.abs, t.pct * base);
  const common = { computedKcal, statedKcal: calories, diffKcal, diffPct };
  if (within(TOLERANCE.ok)) return { ...common, status: "consistent", suggestedCalories: null, message: "Calories and macros agree." };
  const direction = diffKcal > 0 ? "more" : "fewer";
  if (within(TOLERANCE.minor)) {
    return { ...common, status: "minor", suggestedCalories: computedKcal, message: `Small difference: the macros add up to about ${computedKcal} kcal, ${Math.abs(diffKcal)} ${direction} than the ${calories} kcal entered. That can be normal (rounding, fibre, alcohol).` };
  }
  return {
    ...common, status: "inconsistent", suggestedCalories: computedKcal,
    message: `These don't add up: ${Math.round(protein)} g protein, ${Math.round(carbs)} g carbs and ${Math.round(fat)} g fat come to about ${computedKcal} kcal, not ${calories} kcal. One of the numbers is probably off — check before logging.`,
  };
}

/** Short badge text for a logged entry's source, so an estimate is never mistaken for a measured value. */
export function describeEntrySource(entry) {
  if (!entry) return null;
  if (entry.source === "ai_estimate" || entry.estimated) return "Estimate";
  if (entry.source === "barcode") return "Product database";
  if (entry.source === "photo") return "Photo estimate";
  return null;
}

/** Mid-point of an uncertainty range [lo, hi], or the number itself. Null if unknown. */
export function midpoint(range) {
  if (Array.isArray(range)) {
    const lo = num(range[0]), hi = num(range[1]);
    if (lo === null || hi === null || hi < lo) return null;
    return Math.round((lo + hi) / 2);
  }
  const n = num(range);
  return n === null ? null : Math.round(n);
}
