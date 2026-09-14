// Pure workout-math helpers, extracted out of App.jsx so they're independently unit-testable
// without rendering any React component. No side effects, no network/storage calls — every
// function here takes plain data in and returns plain data out.

import { classifyDayAdherence } from "./nutritionMath";

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
  // `current`/`target` added alongside `earned` so an unearned badge can show real progress
  // ("6/10 workouts") instead of just a greyed-out icon with no sense of how close it is.
  const badges = [
    { id: "first", label: "First Session", earned: safeWorkouts.length >= 1, icon: "🏁", current: Math.min(safeWorkouts.length, 1), target: 1 },
    { id: "ten", label: "10 Workouts", earned: safeWorkouts.length >= 10, icon: "🔟", current: Math.min(safeWorkouts.length, 10), target: 10 },
    { id: "twentyfive", label: "25 Workouts", earned: safeWorkouts.length >= 25, icon: "💯", current: Math.min(safeWorkouts.length, 25), target: 25 },
    { id: "streak7", label: "7 Day Streak", earned: (streak || 0) >= 7, icon: "🔥", current: Math.min(streak || 0, 7), target: 7 },
    { id: "streak30", label: "30 Day Streak", earned: (streak || 0) >= 30, icon: "🚀", current: Math.min(streak || 0, 30), target: 30 },
    { id: "vol10k", label: "10,000kg Lifted", earned: totalVolume >= 10000, icon: "🏋️", current: Math.min(Math.round(totalVolume), 10000), target: 10000 },
    { id: "vol100k", label: "100,000kg Lifted", earned: totalVolume >= 100000, icon: "🏆", current: Math.min(Math.round(totalVolume), 100000), target: 100000 },
  ];
  return { xp, level, xpIntoLevel, totalVolume: Math.round(totalVolume), badges };
}

/* ------------------------------------------------------------------ */
/* Missions & Challenges                                               */
/* ------------------------------------------------------------------ */
// Personal-only: everything below is computed from one athlete's own data and compared only
// against their own targets or history — there is no leaderboard, no comparison against other
// users, and nothing here is ever transmitted anywhere.

// Reconstructs every point in an athlete's history where a genuinely new all-time-best weight was
// set, for every exercise — "did a real PR happen in this window", not just "what's the current
// record" (a record later broken again would otherwise vanish from a past window's view). A
// near-identical reconstruction also exists in Progress.jsx for its own PR Timeline feature,
// intentionally duplicated rather than imported: Progress.jsx is a separate lazy-loaded chunk
// (it pulls in recharts), and importing it from here would drag that dependency into the main
// app bundle that loads on every visit.
export function allTimePrEvents(workouts) {
  const exerciseNames = [...new Set((workouts || []).flatMap((w) => (w.exercises || []).map((e) => e.name)))];
  const events = [];
  exerciseNames.forEach((name) => {
    const sessions = (workouts || [])
      .filter((w) => (w.exercises || []).some((e) => e.name === name && hasValidSets(e)))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    let maxWeight = 0;
    sessions.forEach((w) => {
      const bestSet = validSets(w.exercises.find((e) => e.name === name)).reduce((a, b) => (b.weight > a.weight ? b : a));
      if (bestSet.weight > maxWeight) {
        maxWeight = bestSet.weight;
        events.push({ name, date: w.date, weight: bestSet.weight, reps: bestSet.reps });
      }
    });
  });
  return events.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function startOfWeekIso(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

// Four short, always-fresh weekly missions recomputed live from Sunday to Sunday — deliberately
// not persisted anywhere: since they're pure functions of this week's own data, there's no state
// to keep in sync and no way for the displayed status to ever drift from reality.
export function computeWeeklyMissions(workouts, nutrition) {
  const weekStartIso = startOfWeekIso(new Date());
  const safeWorkouts = workouts || [];
  const safeNutrition = nutrition || [];

  const workoutDatesThisWeek = new Set(safeWorkouts.filter((w) => w.date >= weekStartIso).map((w) => w.date));
  const nutritionDatesThisWeek = new Set(safeNutrition.filter((n) => n.date >= weekStartIso).map((n) => n.date));
  const prsThisWeek = allTimePrEvents(safeWorkouts).filter((ev) => ev.date >= weekStartIso).length;

  const exercisesBefore = new Set(safeWorkouts.filter((w) => w.date < weekStartIso).flatMap((w) => w.exercises.map((e) => e.name)));
  const exercisesThisWeek = new Set(
    safeWorkouts.filter((w) => w.date >= weekStartIso).flatMap((w) => w.exercises.filter(hasValidSets).map((e) => e.name))
  );
  const triedNewExercise = [...exercisesThisWeek].some((name) => !exercisesBefore.has(name));

  const missions = [
    { id: "train3", label: "Train 3 times this week", current: Math.min(workoutDatesThisWeek.size, 3), target: 3 },
    { id: "log5", label: "Log nutrition 5 days this week", current: Math.min(nutritionDatesThisWeek.size, 5), target: 5 },
    { id: "pr1", label: "Set a new PR this week", current: Math.min(prsThisWeek, 1), target: 1 },
    { id: "newExercise", label: "Try a new exercise this week", current: triedNewExercise ? 1 : 0, target: 1 },
  ];
  return missions.map((m) => ({ ...m, completed: m.current >= m.target }));
}

// Longer, opt-in personal challenges the athlete explicitly starts (see KEYS.challenges in
// App.jsx) — each template names a metric computed purely from the athlete's own logged data
// within a fixed window starting the day they started it.
export const CHALLENGE_TEMPLATES = [
  { id: "consistency30", label: "30-Day Consistency", description: "Train on at least 20 of the next 30 days.", icon: "📅", durationDays: 30, targetValue: 20, metric: "daysTrained", unit: "days trained" },
  { id: "sets1000", label: "1,000 Sets in 6 Weeks", description: "Log 1,000 total sets within 6 weeks.", icon: "🏋️", durationDays: 42, targetValue: 1000, metric: "totalSets", unit: "sets" },
  { id: "nutrition21", label: "21 On-Target Days", description: "Hit your nutrition target on 21 days within 30 days.", icon: "🥗", durationDays: 30, targetValue: 21, metric: "onTargetDays", unit: "days on target" },
  { id: "prHunt", label: "New PR Hunt", description: "Set 3 new personal records within 4 weeks.", icon: "🎯", durationDays: 28, targetValue: 3, metric: "prCount", unit: "PRs" },
];

// `challenge` is a persisted instance: { id, templateId, startDate }. Progress is always computed
// live from workouts/nutrition — nothing about "how far along" is ever itself persisted, so it
// can never go stale relative to the underlying data.
export function computeChallengeProgress(challenge, workouts, nutrition, nutritionTargets) {
  const template = CHALLENGE_TEMPLATES.find((t) => t.id === challenge.templateId);
  if (!template) return null;

  // Every date here is a plain "YYYY-MM-DD" calendar-date string (the same convention todayStr()
  // uses elsewhere in the app) — parsed and compared entirely via Date.UTC() component math,
  // never through `new Date(isoString)` followed by `.setHours()`. That combination mixes
  // UTC-midnight parsing with local-time reinterpretation and silently shifts the elapsed-day
  // count for anyone not at UTC+0 (found live at UTC+10: a challenge started 5 days ago read back
  // as "Day 7").
  const toUtcMs = (isoDate) => {
    const [y, m, d] = isoDate.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const startIso = challenge.startDate;
  const startMs = toUtcMs(startIso);
  const endIso = new Date(startMs + (template.durationDays - 1) * 86400000).toISOString().slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10); // same convention as todayStr()
  const daysElapsed = Math.min(template.durationDays, Math.max(1, Math.floor((toUtcMs(todayIso) - startMs) / 86400000) + 1));

  const inWindow = (w) => w.date >= startIso && w.date <= endIso;
  let current = 0;
  if (template.metric === "daysTrained") {
    current = new Set((workouts || []).filter(inWindow).map((w) => w.date)).size;
  } else if (template.metric === "totalSets") {
    current = (workouts || []).filter(inWindow).reduce((n, w) => n + w.exercises.reduce((n2, e) => n2 + validSets(e).length, 0), 0);
  } else if (template.metric === "onTargetDays") {
    const byDate = new Map();
    (nutrition || []).filter((f) => f.date >= startIso && f.date <= endIso).forEach((f) => {
      if (!byDate.has(f.date)) byDate.set(f.date, []);
      byDate.get(f.date).push(f);
    });
    current = [...byDate.values()].filter((dayFoods) => classifyDayAdherence(dayFoods, nutritionTargets) === "good").length;
  } else if (template.metric === "prCount") {
    current = allTimePrEvents(workouts).filter((ev) => ev.date >= startIso && ev.date <= endIso).length;
  }

  const completed = current >= template.targetValue;
  const expired = daysElapsed >= template.durationDays;
  return { template, current, target: template.targetValue, daysElapsed, durationDays: template.durationDays, completed, expired, finished: completed || expired, endIso };
}
