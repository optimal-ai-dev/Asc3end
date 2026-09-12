// Pure workout-math helpers, extracted out of App.jsx so they're independently unit-testable
// without rendering any React component. No side effects, no network/storage calls — every
// function here takes plain data in and returns plain data out.

export const REP_RANGES = {
  muscle_growth: [8, 12],
  strength: [4, 6],
  fat_loss: [10, 15],
  general: [8, 12],
};

// A set only counts as real, loggable history if it carries a finite, positive weight and reps.
// An exercise added to a workout but never actually logged persists as `sets: []` (or, from
// malformed/legacy data, sets with missing/zero/non-numeric fields) — treating those as real data
// is what previously let Math.max(...[]) produce -Infinity and render literally as "-Infinitykg".
export function hasValidSets(exercise) {
  return (exercise?.sets || []).some(
    (s) => Number.isFinite(s?.weight) && s.weight > 0 && Number.isFinite(s?.reps) && s.reps > 0
  );
}

export function validSets(exercise) {
  return (exercise?.sets || []).filter(
    (s) => Number.isFinite(s?.weight) && s.weight > 0 && Number.isFinite(s?.reps) && s.reps > 0
  );
}

// Suggests the next weight/rep target for an exercise based on the most recent session that
// actually has real logged data for it. Never returns Infinity/-Infinity/NaN — an exercise with
// no valid history at all falls back to a "no history yet" message instead of doing math on an
// empty set.
export function suggestNextTarget(workouts, exerciseName, goal) {
  const [lo, hi] = REP_RANGES[goal] || REP_RANGES.general;
  const history = (workouts || [])
    .filter((w) => (w.exercises || []).some((e) => e.name === exerciseName && hasValidSets(e)))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  if (history.length === 0) {
    return { text: `No history yet. Pick a weight you can control for ${lo}-${hi} reps and log it.`, weight: null };
  }
  const last = history[0].exercises.find((e) => e.name === exerciseName && hasValidSets(e));
  const sets = validSets(last);
  const topWeight = Math.max(...sets.map((s) => s.weight));
  const allHitTop = sets.every((s) => s.weight === topWeight && s.reps >= hi);
  if (allHitTop) {
    const nextWeight = Math.round((topWeight + topWeight * 0.025) / 2.5) * 2.5;
    return {
      text: `Last time you hit ${hi}+ reps across the board at ${topWeight}kg. Move up to ${nextWeight}kg and aim for ${lo} reps.`,
      weight: nextWeight,
    };
  }
  const lowestSet = sets.reduce((a, b) => (a.reps < b.reps ? a : b));
  return {
    text: `Stay at ${topWeight}kg. Push for ${Math.min(lowestSet.reps + 1, hi)}+ reps on your weakest set.`,
    weight: topWeight,
  };
}

// Whether a just-logged set is a personal record against prior history for that exercise. Guards
// empty history with the same Math.max(0, ...) pattern used app-wide rather than spreading an
// empty array directly.
export function evaluatePR(historySets, weight, reps) {
  const safeHistory = (historySets || []).filter((s) => Number.isFinite(s?.weight) && Number.isFinite(s?.reps));
  const maxWeightEver = safeHistory.length ? Math.max(...safeHistory.map((s) => s.weight)) : 0;
  if (weight > maxWeightEver) return { isPR: true, type: "weight" };
  const sameWeightSets = safeHistory.filter((s) => s.weight === weight);
  const maxRepsAtWeight = sameWeightSets.length ? Math.max(...sameWeightSets.map((s) => s.reps)) : 0;
  if (sameWeightSets.length > 0 && reps > maxRepsAtWeight) return { isPR: true, type: "reps" };
  return { isPR: false };
}

// Current consecutive-day training streak, counting back from today (or from yesterday if
// nothing's logged yet today — a rest day doesn't zero out an active streak until a day is
// actually skipped). Extracted from Dashboard so Train's finish-workout summary can compute the
// exact same "streak before this workout" vs. "streak after" to show an accurate streak-bonus XP
// line — duplicating this logic in two places risked exactly the kind of drift this whole XP
// rework exists to eliminate.
export function computeStreak(workouts) {
  const dates = new Set((workouts || []).map((w) => w.date));
  let s = 0;
  let d = new Date();
  const todayKey = new Date().toISOString().slice(0, 10);
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (dates.has(key)) { s++; d.setDate(d.getDate() - 1); }
    else if (s === 0 && key === todayKey) { d.setDate(d.getDate() - 1); continue; }
    else break;
  }
  return s;
}

const XP_PER_SET = 3;
const XP_PER_EXERCISE = 5;
const XP_PER_PR = 15;
const XP_PER_STREAK_DAY = 10;

// The exact XP a single workout earns, broken into the same labeled components shown in the
// finish-workout summary — computed once, at completion time, and stored on the workout object
// (`xpBreakdown`) rather than re-derived from aggregate stats later. This is what makes "the
// summary total equals the amount added to the account" actually hold: both the summary screen
// and the running total in computeGamification read this exact same stored number, instead of
// the summary showing one formula's output and the total being computed by a different one that
// could (and did — this was a real, reported bug) silently disagree, e.g. by omitting the streak
// bonus the total secretly included.
//
// `streakDelta` is the caller's job to compute (computeStreak(workoutsIncludingThis) -
// computeStreak(workoutsBeforeThis)) since it depends on order/timing this function has no view
// of — passing 0 is always safe (just omits the streak line), which is exactly what a second
// workout logged on the same day should show, since the streak doesn't increase twice in one day.
export function computeWorkoutXp(workout, { prCount = 0, streakDelta = 0 } = {}) {
  const exerciseCount = (workout?.exercises || []).filter(hasValidSets).length;
  const setCount = (workout?.exercises || []).reduce((n, e) => n + validSets(e).length, 0);
  const completion = exerciseCount > 0 ? 50 : 0;
  const sets = setCount * XP_PER_SET + exerciseCount * XP_PER_EXERCISE;
  const prBonus = Math.max(0, prCount) * XP_PER_PR;
  const streakBonus = Math.max(0, streakDelta) * XP_PER_STREAK_DAY;
  return {
    completion, sets, prBonus, streakBonus,
    total: completion + sets + prBonus + streakBonus,
  };
}

// Legacy workouts saved before this rework don't carry a stored `xpBreakdown` — approximate one
// from the old formula's components (completion + a volume-based figure standing in for the new
// sets/exercise-based one) so old history still shows a sane, non-zero, non-NaN number instead of
// nothing. New workouts always use their own stored breakdown, never this approximation.
function legacyXpBreakdown(workout) {
  const totalVolume = (workout?.exercises || []).reduce((s, e) => s + validSets(e).reduce((s2, st) => s2 + st.weight * st.reps, 0), 0);
  const exerciseCount = (workout?.exercises || []).filter(hasValidSets).length;
  const completion = exerciseCount > 0 ? 50 : 0;
  const sets = Math.round(totalVolume / 20);
  return { completion, sets, prBonus: 0, streakBonus: 0, total: completion + sets };
}

export function workoutXpBreakdown(workout) {
  const stored = workout?.xpBreakdown;
  if (stored && Number.isFinite(stored.total)) return stored;
  return legacyXpBreakdown(workout);
}

// XP/level/badges from logged activity — the running total is now simply the sum of each
// workout's own already-computed breakdown, so it can never drift from what any individual
// workout's summary said it earned.
export function computeGamification(workouts, streak) {
  const safeWorkouts = workouts || [];
  const totalVolume = safeWorkouts.reduce(
    (s, w) => s + (w.exercises || []).reduce((s2, e) => s2 + validSets(e).reduce((s3, st) => s3 + st.weight * st.reps, 0), 0),
    0
  );
  const xp = safeWorkouts.reduce((sum, w) => sum + workoutXpBreakdown(w).total, 0);
  const level = Math.floor(xp / 500) + 1;
  const xpIntoLevel = xp % 500;
  const badges = [
    { id: "first", label: "First Session", earned: safeWorkouts.length >= 1, icon: "🏁" },
    { id: "ten", label: "10 Workouts", earned: safeWorkouts.length >= 10, icon: "🔟" },
    { id: "twentyfive", label: "25 Workouts", earned: safeWorkouts.length >= 25, icon: "💯" },
    { id: "streak7", label: "7 Day Streak", earned: (streak || 0) >= 7, icon: "🔥" },
    { id: "streak30", label: "30 Day Streak", earned: (streak || 0) >= 30, icon: "🚀" },
    { id: "vol10k", label: "10,000kg Lifted", earned: totalVolume >= 10000, icon: "🏋️" },
    { id: "vol100k", label: "100,000kg Lifted", earned: totalVolume >= 100000, icon: "🏆" },
  ];
  return { xp, level, xpIntoLevel, totalVolume: Math.round(totalVolume), badges };
}
