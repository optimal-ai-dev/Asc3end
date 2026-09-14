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

// THE single source of truth for "what are this athlete's nutrition targets right now" —
// Home, Food, Profile & Settings, the Coach system prompt, and any future API all call this one
// function instead of computeTargets() directly or reading a cached `profile.targets` snapshot.
//
// The previous design stored a `profile.targets` snapshot (written by onboarding and by Profile's
// "Save Changes") *alongside* live computeTargets(profile) calls elsewhere (Home, Food) — two
// independent sources of the same number that could silently drift apart the moment a profile
// was updated through any path that didn't also refresh the snapshot (exactly what produced the
// "2800 kcal in Settings vs 2891 kcal on Home" bug report). Recomputing fresh from the live
// profile every time — never trusting a stored snapshot for calculated mode — makes that class of
// bug structurally impossible: there is nothing left to go stale.
//
// @returns {{calories:number, protein:number, carbs:number, fat:number, source: "calculated"|"manual"}}
export function getNutritionTargets(profile) {
  const targets = computeTargets(profile);
  return { ...targets, source: profile?.macroOverride ? "manual" : "calculated" };
}

// The single classification rule behind every adherence view in the app (Home's weekly strip,
// the Monthly Report, and the nutrition challenge template) — one place to change the thresholds,
// one place that can drift. "good" needs calories in a reasonable band AND protein reasonably
// close to target, since hitting calories by skipping protein isn't really adherence to the plan.
export function classifyDayAdherence(dayFoods, targets) {
  if (dayFoods.length === 0) return "none";
  const totals = dayFoods.reduce((a, f) => ({ calories: a.calories + f.calories, protein: a.protein + f.protein }), { calories: 0, protein: 0 });
  const calRatio = targets.calories > 0 ? totals.calories / targets.calories : 0;
  const proteinRatio = targets.protein > 0 ? totals.protein / targets.protein : 0;
  if (calRatio >= 0.85 && calRatio <= 1.15 && proteinRatio >= 0.8) return "good";
  if (calRatio >= 0.7 && calRatio <= 1.3) return "partial";
  return "off";
}
