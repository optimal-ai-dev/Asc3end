// Water tracking. Each tap of a quick-add button is its own entry ({ id, date, ml }), stored in
// user_data under KEYS.water like the food log, so "undo last" is just removing the newest one.

export const WATER_QUICK_ADDS = [
  { ml: 250, label: "Glass" },
  { ml: 500, label: "Bottle" },
  { ml: 750, label: "Large bottle" },
];

// About 35 ml per kg of bodyweight is the common rule of thumb for total daily fluid, rounded to
// a whole glass and kept within sensible bounds. An explicit profile.waterGoalMl always wins.
export function waterGoalMl(profile) {
  const set = profile?.waterGoalMl;
  if (Number.isFinite(set) && set > 0) return set;
  const kg = profile?.weightKg;
  if (!Number.isFinite(kg) || kg <= 0) return 2500;
  return Math.min(4500, Math.max(1500, Math.round((kg * 35) / 250) * 250));
}

export function waterForDate(entries, date) {
  return (entries || []).filter((w) => w.date === date).reduce((sum, w) => sum + w.ml, 0);
}

export function formatMl(ml) {
  return ml >= 1000 ? `${(ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 2).replace(/0$/, "")} L` : `${ml} ml`;
}
