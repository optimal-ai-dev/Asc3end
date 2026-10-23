import { computeTargets, GOAL_CALORIE_ADJUSTMENT } from "./nutritionMath";

// Weekly adaptive calorie check-in. The formula target (Mifflin-St Jeor x 1.55) is a population
// guess that can be several hundred kcal off for any one person. Once someone has logged food and
// weighed in for a couple of weeks, their own data says what maintenance really is:
//
//   maintenance ≈ average daily intake − (daily weight change × 7700 kcal/kg)
//
// Everything here is deterministic — no AI call, no new storage table (the accepted number lives
// on the profile JSON as `adaptiveCalories`). The window only covers *completed* weeks, ending
// the day before this week's Monday, so the recommendation stays the same all week instead of
// shifting every time a meal is logged.

export const KCAL_PER_KG = 7700;
export const WINDOW_DAYS = 21;
export const MIN_INTAKE_DAYS = 10;
export const MIN_WEIGH_INS = 4;
export const MIN_WEIGH_IN_SPAN_DAYS = 10;
// Max move per weekly check-in, so one noisy week (water weight, a holiday) can't swing the target.
export const MAX_WEEKLY_CHANGE = 200;
// Data-derived maintenance is kept within ±25% of the formula — beyond that it's far likelier
// that logging is incomplete than that someone's metabolism is that unusual.
const MAX_TDEE_DEVIATION = 0.25;

const DAY_MS = 86400000;
const toDay = (iso) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);
const toIso = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);

// Monday of the week containing `iso` (dates are the app's UTC YYYY-MM-DD strings).
export function weekStartIso(iso) {
  const day = toDay(iso);
  const weekday = (new Date(day * DAY_MS).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return toIso(day - weekday);
}

// Least-squares slope of weight over time, in kg/day. Smoother than first-vs-last, which a single
// post-salty-dinner weigh-in can throw off badly.
export function weightTrendPerDay(points) {
  const n = points.length;
  if (n < 2) return 0;
  const mx = points.reduce((a, p) => a + p.day, 0) / n;
  const my = points.reduce((a, p) => a + p.weight, 0) / n;
  let num = 0, den = 0;
  for (const p of points) {
    num += (p.day - mx) * (p.weight - my);
    den += (p.day - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

const calorieFloor = (profile) => (profile.gender === "female" ? 1200 : 1500);
const round10 = (n) => Math.round(n / 10) * 10;

/**
 * @returns {{status:"need_data", weekOf:string, intakeDays:number, weighIns:number, needIntakeDays:number, needWeighIns:number}
 *   | {status:"ready", weekOf:string, calories:number, current:number, change:number, formulaCalories:number,
 *      estimatedMaintenance:number, weeklyWeightChangeKg:number, avgIntake:number, intakeDays:number, weighIns:number}}
 */
export function computeWeeklyCheckIn({ profile, nutrition = [], weightlog = [], today }) {
  const weekOf = weekStartIso(today);
  const end = toDay(weekOf) - 1; // last completed day
  const start = end - WINDOW_DAYS + 1;
  const inWindow = (iso) => {
    const d = toDay(iso);
    return d >= start && d <= end;
  };

  const formulaCalories = computeTargets({ ...profile, macroOverride: null, adaptiveCalories: null }).calories;
  const goalAdj = GOAL_CALORIE_ADJUSTMENT[profile.goal] ?? 0;
  const formulaMaintenance = formulaCalories - goalAdj;

  // Daily intake totals. Days under 40% of the formula target are treated as partially logged
  // (a forgotten dinner, not a 700 kcal day) and left out rather than dragging the average down.
  const byDay = new Map();
  for (const f of nutrition) {
    if (!f?.date || !inWindow(f.date)) continue;
    byDay.set(f.date, (byDay.get(f.date) || 0) + (Number(f.calories) || 0));
  }
  const intakeTotals = [...byDay.values()].filter((kcal) => kcal >= formulaCalories * 0.4);

  // One point per day (the day's average) so several weigh-ins on one morning don't over-weight it.
  const weightsByDay = new Map();
  for (const w of weightlog) {
    if (!w?.date || !Number.isFinite(w.weight) || w.weight <= 0 || !inWindow(w.date)) continue;
    const d = toDay(w.date);
    const arr = weightsByDay.get(d) || [];
    arr.push(w.weight);
    weightsByDay.set(d, arr);
  }
  const weightPoints = [...weightsByDay.entries()]
    .map(([day, ws]) => ({ day, weight: ws.reduce((a, b) => a + b, 0) / ws.length }))
    .sort((a, b) => a.day - b.day);
  const span = weightPoints.length > 1 ? weightPoints[weightPoints.length - 1].day - weightPoints[0].day : 0;

  const enoughData = intakeTotals.length >= MIN_INTAKE_DAYS && weightPoints.length >= MIN_WEIGH_INS && span >= MIN_WEIGH_IN_SPAN_DAYS;
  if (!enoughData) {
    return {
      status: "need_data",
      weekOf,
      intakeDays: intakeTotals.length,
      weighIns: weightPoints.length,
      needIntakeDays: MIN_INTAKE_DAYS,
      needWeighIns: MIN_WEIGH_INS,
    };
  }

  const avgIntake = intakeTotals.reduce((a, b) => a + b, 0) / intakeTotals.length;
  const slope = weightTrendPerDay(weightPoints);
  const rawMaintenance = avgIntake - slope * KCAL_PER_KG;
  const clampedMaintenance = Math.min(
    formulaMaintenance * (1 + MAX_TDEE_DEVIATION),
    Math.max(formulaMaintenance * (1 - MAX_TDEE_DEVIATION), rawMaintenance)
  );
  // Trust the data more the more complete the logging is; a full window means full trust.
  const confidence = Math.min(1, intakeTotals.length / WINDOW_DAYS);
  const estimatedMaintenance = confidence * clampedMaintenance + (1 - confidence) * formulaMaintenance;

  const current = computeTargets({ ...profile, macroOverride: null }).calories;
  const ideal = Math.max(calorieFloor(profile), estimatedMaintenance + goalAdj);
  const step = Math.max(-MAX_WEEKLY_CHANGE, Math.min(MAX_WEEKLY_CHANGE, ideal - current));
  const calories = Math.max(calorieFloor(profile), round10(current + step));

  return {
    status: "ready",
    weekOf,
    calories,
    current,
    change: calories - current,
    formulaCalories,
    estimatedMaintenance: Math.round(estimatedMaintenance),
    weeklyWeightChangeKg: Math.round(slope * 7 * 100) / 100,
    avgIntake: Math.round(avgIntake),
    intakeDays: intakeTotals.length,
    weighIns: weightPoints.length,
  };
}
