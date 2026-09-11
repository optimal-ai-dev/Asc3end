// Pure nutrition-math helpers, extracted out of App.jsx so they're independently unit-testable.

// Mifflin-St Jeor calorie/macro targets from a profile. Falls back to reasonable placeholder
// body metrics instead of propagating NaN through every downstream number when a profile is
// malformed or still mid-onboarding (missing weight/height/age).
export function computeTargets(p) {
  // A manually-set override (Profile > Nutrition) always wins over the calculated targets —
  // recalculating body metrics should never silently clobber a target the user chose on purpose.
  if (p.macroOverride) return p.macroOverride;
  const weightKg = Number.isFinite(p.weightKg) && p.weightKg > 0 ? p.weightKg : 70;
  const heightCm = Number.isFinite(p.heightCm) && p.heightCm > 0 ? p.heightCm : 170;
  const age = Number.isFinite(p.age) && p.age > 0 ? p.age : 30;
  const bmr =
    p.gender === "female"
      ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
      : 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  const tdee = bmr * 1.55;
  let calories = tdee;
  if (p.goal === "fat_loss") calories -= 500;
  if (p.goal === "muscle_growth") calories += 250;
  if (p.goal === "strength") calories += 100;

  const proteinPerKg = p.goal === "fat_loss" ? 2.0 : p.goal === "general" ? 1.6 : 1.8;
  const protein = proteinPerKg * weightKg;
  const fat = (calories * 0.25) / 9;
  const carbs = (calories - protein * 4 - fat * 9) / 4;

  return {
    calories: Math.round(calories),
    protein: Math.round(protein),
    carbs: Math.round(Math.max(carbs, 0)),
    fat: Math.round(fat),
  };
}
