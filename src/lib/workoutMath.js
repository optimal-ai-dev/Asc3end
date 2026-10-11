// Pure workout-math helpers, extracted out of App.jsx so they're independently unit-testable
// without rendering any React component. No side effects, no network/storage calls — every
// function here takes plain data in and returns plain data out.
//
// Sets are always read through the shared measurement model (./measurement) and local calendar
// dates through the shared date policy (./dates): a duration-only exercise never produces tonnage
// or a 1RM, a warm-up never counts as a working set, and "today" is the viewer's local date, not
// the UTC date.

import { classifyDayAdherence } from "./nutritionMath.js";
import {
  effectiveTrackingType, isSetComplete, isWorkingSet, isPrEligible, setVolume, specFor, estimate1RM,
  bestSet, compareSets, exerciseVolume, setKind, isBaselineEligible,
} from "./measurement.js";
import { computeProgression, GOAL_REP_RANGES } from "./progression.js";
import { resolveTrackingType, findExercise } from "./exerciseLookup.js";
import { today as localToday, addDays, startOfWeek, daysBetween, getTimeZone } from "./dates.js";

export const REP_RANGES = GOAL_REP_RANGES;

/** The measurement type an already-logged exercise entry should be read as. */
export function entryType(entry, customExercises) {
  return effectiveTrackingType(entry, resolveTrackingType(entry?.name, customExercises));
}

// A set only counts as real, loggable history if it carries valid data for its measurement type.
// An exercise added to a workout but never actually logged persists as `sets: []` (or, from
// malformed/legacy data, sets with missing/zero/non-numeric fields) — treating those as real data
// is what previously let Math.max(...[]) produce -Infinity and render literally as "-Infinitykg".
export function validSets(exercise, customExercises) {
  const type = entryType(exercise, customExercises);
  return (exercise?.sets || []).filter((s) => isSetComplete(s, type));
}

export function hasValidSets(exercise, customExercises) {
  return validSets(exercise, customExercises).length > 0;
}

/** Valid sets that are real working volume (excludes warm-ups). */
export function workingSets(exercise, customExercises) {
  return validSets(exercise, customExercises).filter(isWorkingSet);
}

// Compatibility wrapper around the progression engine (./progression), which owns the rules:
// warm-ups, drop sets and deloads never become a baseline; warm-up-only/empty sessions are
// skipped; the target comes from the plan if there is one. Returns { text, weight, ...details }.
export function suggestNextTarget(workouts, exerciseName, goal, opts = {}) {
  const ex = findExercise(exerciseName, opts.customExercises);
  return computeProgression({
    workouts, exerciseName, goal,
    trackingType: opts.trackingType || ex?.trackingType || "weight_reps",
    equipment: opts.equipment || ex?.equipment,
    planTarget: opts.planTarget,
    unit: opts.unit,
    increments: opts.increments,
  });
}

const PR_LABEL = { weight: "weight", reps: "reps", durationSeconds: "duration", distanceMeters: "distance", assistWeight: "assistance" };

/** Is `set` a personal record against `historySets` for this measurement type? Warm-up, drop and
 *  deload history never raise the bar, and a warm-up/drop/deload set can never itself be a PR. */
export function evaluateSetPR(historySets, set, type) {
  if (!isPrEligible(set) || !isSetComplete(set, type)) return { isPR: false };
  const fields = specFor(type).best;
  const history = (historySets || []).filter((s) => isPrEligible(s) && isSetComplete(s, type));
  const [primary, dir] = fields[0];
  const better = (a, b) => (dir === "min" ? a < b : a > b);
  if (history.length === 0) return { isPR: true, type: PR_LABEL[primary] };
  const valueOf = (s) => (Number.isFinite(s[primary]) ? s[primary] : (dir === "min" ? Infinity : 0));
  const bestPrimary = history.reduce((m, s) => (better(valueOf(s), m) ? valueOf(s) : m), valueOf(history[0]));
  if (better(valueOf(set), bestPrimary)) return { isPR: true, type: PR_LABEL[primary] };
  if (fields[1] && valueOf(set) === bestPrimary) {
    const [secondary, sdir] = fields[1];
    const sBetter = (a, b) => (sdir === "min" ? a < b : a > b);
    const sv = (s) => (Number.isFinite(s[secondary]) ? s[secondary] : (sdir === "min" ? Infinity : 0));
    const atBest = history.filter((s) => valueOf(s) === bestPrimary);
    const bestSecondary = atBest.reduce((m, s) => (sBetter(sv(s), m) ? sv(s) : m), sv(atBest[0]));
    if (sBetter(sv(set), bestSecondary)) return { isPR: true, type: PR_LABEL[secondary] };
  }
  return { isPR: false };
}

// Whether a just-logged weight x reps set is a personal record against prior history. Kept for
// callers/tests that only deal in weight x reps; prefer evaluateSetPR.
export function evaluatePR(historySets, weight, reps) {
  return evaluateSetPR(historySets, { weight, reps, type: "normal" }, "weight_reps");
}

/** Every personal record set during an in-progress (or just-finished) session, judged set by set
 *  against prior history plus the session's own earlier sets. Deterministic, so correcting or
 *  deleting a set changes the result — nothing about PRs is cached. */
export function sessionPrEvents(workouts, session, customExercises) {
  const events = [];
  for (const entry of session?.exercises || []) {
    const type = entryType(entry, customExercises);
    let history = (workouts || []).flatMap((w) =>
      (w.exercises || []).filter((e) => e.name === entry.name && entryType(e, customExercises) === type).flatMap((e) => e.sets || [])
    );
    for (const set of entry.sets || []) {
      const verdict = evaluateSetPR(history, set, type);
      if (verdict.isPR) events.push({ exId: entry.id, exName: entry.name, setId: set.id, type: verdict.type, set, trackingType: type, weight: set.weight, reps: set.reps });
      if (isPrEligible(set) && isSetComplete(set, type)) history = history.concat(set);
    }
  }
  return events;
}

// Current consecutive-day training streak, counting back from today (or from yesterday if
// nothing's logged yet today — a rest day doesn't zero out an active streak until a day is
// actually skipped). Workout dates are local calendar-date strings (see ./dates), so the streak
// agrees with what History and Home display.
export function computeStreak(workouts, { now = Date.now(), timeZone = getTimeZone() } = {}) {
  const dates = new Set((workouts || []).map((w) => w.date));
  const todayKey = localToday(now, timeZone);
  let s = 0;
  let key = todayKey;
  while (true) {
    if (dates.has(key)) { s++; key = addDays(key, -1); }
    else if (s === 0 && key === todayKey) { key = addDays(key, -1); continue; }
    else break;
  }
  return s;
}

const XP_PER_SET = 3;
const XP_PER_EXERCISE = 5;
const XP_PER_PR = 15;
const XP_PER_STREAK_DAY = 10;

/** Tonnage of a workout in logged-weight x reps, working sets only, each exercise read through
 *  its own measurement type (so a plank contributes nothing instead of NaN). */
export function workoutVolumeKg(workout, customExercises) {
  return (workout?.exercises || []).reduce((n, e) => {
    const type = entryType(e, customExercises);
    return n + (e.sets || []).filter((s) => isWorkingSet(s) && isSetComplete(s, type)).reduce((m, s) => m + (setVolume(s, type) || 0), 0);
  }, 0);
}

// The exact XP a single workout earns, broken into the same labeled components shown in the
// finish-workout summary — computed once, at completion time, and stored on the workout object
// (`xpBreakdown`) rather than re-derived from aggregate stats later, so the summary total always
// equals the amount added to the account. `streakDelta` is the caller's job to compute
// (computeStreak(workoutsIncludingThis) - computeStreak(workoutsBeforeThis)); passing 0 is always
// safe (it just omits the streak line), which is what a second workout on the same day should show.
export function computeWorkoutXp(workout, { prCount = 0, streakDelta = 0 } = {}) {
  const exercises = workout?.exercises || [];
  const exerciseCount = exercises.filter((e) => workingSets(e).length > 0).length;
  const setCount = exercises.reduce((n, e) => n + workingSets(e).length, 0);
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
// from the old formula's components so old history still shows a sane, non-NaN number. New
// workouts always use their own stored breakdown, never this approximation.
function legacyXpBreakdown(workout) {
  const totalVolume = workoutVolumeKg(workout);
  const exerciseCount = (workout?.exercises || []).filter((e) => workingSets(e).length > 0).length;
  const completion = exerciseCount > 0 ? 50 : 0;
  const sets = Math.round(totalVolume / 20);
  return { completion, sets, prBonus: 0, streakBonus: 0, total: completion + sets };
}

export function workoutXpBreakdown(workout) {
  const stored = workout?.xpBreakdown;
  if (stored && Number.isFinite(stored.total)) return stored;
  return legacyXpBreakdown(workout);
}

// XP/level/badges from logged activity — the running total is simply the sum of each workout's
// own already-computed breakdown, so it can never drift from what any workout's summary said.
export function computeGamification(workouts, streak) {
  const safeWorkouts = workouts || [];
  const totalVolume = safeWorkouts.reduce((s, w) => s + workoutVolumeKg(w), 0);
  const xp = safeWorkouts.reduce((sum, w) => sum + workoutXpBreakdown(w).total, 0);
  const level = Math.floor(xp / 500) + 1;
  const xpIntoLevel = xp % 500;
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
// against their own targets or history — no leaderboard, nothing transmitted anywhere.

// Reconstructs every point in an athlete's history where a genuinely new all-time best was set,
// for every exercise, judged by that exercise's own measurement type (heaviest weight for lifts,
// most reps for bodyweight work, longest hold for a plank, least assistance for assisted
// movements). Warm-up/drop/deload sets never set a PR. Progress.jsx's PR Timeline reads this too.
export function allTimePrEvents(workouts, customExercises) {
  const names = [...new Set((workouts || []).flatMap((w) => (w.exercises || []).map((e) => e.name)))];
  const events = [];
  names.forEach((name) => {
    const sessions = (workouts || [])
      .filter((w) => (w.exercises || []).some((e) => e.name === name))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let history = [];
    sessions.forEach((w) => {
      w.exercises.filter((e) => e.name === name).forEach((entry) => {
        const type = entryType(entry, customExercises);
        const eligible = (entry.sets || []).filter((s) => isPrEligible(s) && isSetComplete(s, type));
        if (eligible.length === 0) return;
        const top = bestSet(eligible, type);
        const verdict = evaluateSetPR(history, top, type);
        if (verdict.isPR) events.push({ name, date: w.date, type: verdict.type, set: top, trackingType: type, weight: top.weight, reps: top.reps });
        history = history.concat(eligible);
      });
    });
  });
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Four short, always-fresh weekly missions recomputed live from Sunday to Sunday — deliberately
// not persisted: pure functions of this week's data, so the displayed status can't drift.
export function computeWeeklyMissions(workouts, nutrition, { now = Date.now(), timeZone = getTimeZone() } = {}) {
  const weekStartIso = startOfWeek(localToday(now, timeZone));
  const safeWorkouts = workouts || [];
  const safeNutrition = nutrition || [];

  const workoutDatesThisWeek = new Set(safeWorkouts.filter((w) => w.date >= weekStartIso).map((w) => w.date));
  const nutritionDatesThisWeek = new Set(safeNutrition.filter((n) => n.date >= weekStartIso).map((n) => n.date));
  const prsThisWeek = allTimePrEvents(safeWorkouts).filter((ev) => ev.date >= weekStartIso).length;

  const exercisesBefore = new Set(safeWorkouts.filter((w) => w.date < weekStartIso).flatMap((w) => w.exercises.map((e) => e.name)));
  const exercisesThisWeek = new Set(
    safeWorkouts.filter((w) => w.date >= weekStartIso).flatMap((w) => w.exercises.filter((e) => hasValidSets(e)).map((e) => e.name))
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
// live from workouts/nutrition. Every date is a plain "YYYY-MM-DD" local calendar date; all
// arithmetic is pure date-string math (./dates), never `new Date(iso)`.
export function computeChallengeProgress(challenge, workouts, nutrition, nutritionTargets, { now = Date.now(), timeZone = getTimeZone() } = {}) {
  const template = CHALLENGE_TEMPLATES.find((t) => t.id === challenge.templateId);
  if (!template) return null;

  const startIso = challenge.startDate;
  const endIso = addDays(startIso, template.durationDays - 1);
  const todayIso = localToday(now, timeZone);
  const daysElapsed = Math.min(template.durationDays, Math.max(1, daysBetween(startIso, todayIso) + 1));

  const inWindow = (w) => w.date >= startIso && w.date <= endIso;
  let current = 0;
  if (template.metric === "daysTrained") {
    current = new Set((workouts || []).filter(inWindow).map((w) => w.date)).size;
  } else if (template.metric === "totalSets") {
    current = (workouts || []).filter(inWindow).reduce((n, w) => n + w.exercises.reduce((n2, e) => n2 + workingSets(e).length, 0), 0);
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
