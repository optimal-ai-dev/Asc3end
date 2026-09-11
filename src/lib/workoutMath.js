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

// XP/level/badges from logged activity. Each workout contributes its XP exactly once, since it's
// derived by summing over `workouts` (completed history) rather than being incremented
// imperatively anywhere — recomputing this from the same history twice always yields the same
// number, which is what makes "XP awarded once" hold even across re-renders or a page reload.
export function computeGamification(workouts, streak) {
  const safeWorkouts = workouts || [];
  const totalVolume = safeWorkouts.reduce(
    (s, w) => s + (w.exercises || []).reduce((s2, e) => s2 + validSets(e).reduce((s3, st) => s3 + st.weight * st.reps, 0), 0),
    0
  );
  const xp = safeWorkouts.length * 50 + Math.round(totalVolume / 20) + (streak || 0) * 10;
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
