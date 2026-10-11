// Pure data layer behind the Progress screen. Everything here reads sets through the shared
// measurement model, so a duration-only exercise (Plank) yields duration records and a duration
// chart — never a "kg", a "reps" or an estimated 1RM — and dates are local calendar-date strings
// handled with ./dates (never UTC slices).

import { MUSCLE_GROUPS } from "../exerciseData";
import { findExercise } from "./exerciseLookup";
import {
  effectiveTrackingType, isSetComplete, isPrEligible, isWorkingSet, bestSet, compareSets, estimate1RM, setVolume,
  formatSet, specFor, formatDuration, formatDistance,
} from "./measurement";
import { allTimePrEvents, workingSets } from "./workoutMath";
import { today as localToday, addDays, dayOfWeek, startOfWeek, daysBetween } from "./dates";

const byDateAsc = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

function entriesFor(workouts, name, customExercises) {
  const out = [];
  for (const w of workouts || []) {
    for (const entry of w.exercises || []) {
      if (entry?.name !== name) continue;
      const type = effectiveTrackingType(entry, findExercise(name, customExercises)?.trackingType);
      out.push({ workout: w, entry, type, date: w.date, complete: (entry.sets || []).filter((s) => isSetComplete(s, type)) });
    }
  }
  return out.sort(byDateAsc);
}

/** Exercise names with at least one complete set, in first-seen order. */
export function exerciseNamesWithData(workouts, customExercises) {
  const names = new Set();
  for (const w of workouts || []) {
    for (const e of w.exercises || []) {
      if (!e?.name) continue;
      const type = effectiveTrackingType(e, findExercise(e.name, customExercises)?.trackingType);
      if ((e.sets || []).some((s) => isSetComplete(s, type))) names.add(e.name);
    }
  }
  return [...names];
}

/** The measurement type an exercise is currently read as: the latest session with real data. */
export function typeOfExercise(workouts, name, customExercises) {
  const withData = entriesFor(workouts, name, customExercises).filter((e) => e.complete.length > 0);
  return withData.length ? withData[withData.length - 1].type : (findExercise(name, customExercises)?.trackingType || "weight_reps");
}

const tolerantMax = (arr) => arr.reduce((m, v) => (v > m ? v : m), -Infinity);

/** Personal records for one exercise, in the units its measurement type actually uses. */
export function exerciseRecords(workouts, name, customExercises, opts = {}) {
  const sessions = entriesFor(workouts, name, customExercises).filter((s) => s.complete.length > 0);
  if (sessions.length === 0) return { type: typeOfExercise(workouts, name, customExercises), records: [], headline: null, hasData: false };
  const type = sessions[sessions.length - 1].type;
  const spec = specFor(type);
  const records = [];
  const eligible = sessions
    .filter((s) => s.type === type)
    .flatMap((s) => s.entry.sets.filter((x) => isPrEligible(x) && isSetComplete(x, type)).map((set) => ({ set, date: s.date })));
  const fmt = (set) => formatSet(set, type, opts);

  const pick = (cmp) => eligible.reduce((a, b) => (cmp(b, a) > 0 ? b : a), eligible[0]);

  if (eligible.length > 0) {
    const [primaryField, dir] = spec.best[0];
    const primary = pick((a, b) => compareSets(a.set, b.set, type));
    const labelFor = { weight: "Heaviest", reps: "Most reps", durationSeconds: "Longest hold", distanceMeters: "Longest distance", assistWeight: "Least assistance" };
    records.push({ key: "best", label: labelFor[primaryField] || "Best set", text: fmt(primary.set), date: primary.date, set: primary.set });

    if (spec.best[1]) {
      const [secField] = spec.best[1];
      if (secField === "reps" && primaryField !== "reps") {
        const mostReps = pick((a, b) => (a.set.reps ?? 0) - (b.set.reps ?? 0) || (a.set.weight ?? 0) - (b.set.weight ?? 0));
        if (mostReps && mostReps.set !== primary.set) records.push({ key: "reps", label: "Most reps", text: fmt(mostReps.set), date: mostReps.date, set: mostReps.set });
      }
      if (secField === "durationSeconds" && primaryField !== "durationSeconds") {
        const longest = pick((a, b) => (a.set.durationSeconds ?? 0) - (b.set.durationSeconds ?? 0));
        if (longest && longest.set !== primary.set) records.push({ key: "duration", label: "Longest hold", text: fmt(longest.set), date: longest.date, set: longest.set });
      }
      if (secField === "distanceMeters" && primaryField !== "distanceMeters") {
        const farthest = pick((a, b) => (a.set.distanceMeters ?? 0) - (b.set.distanceMeters ?? 0));
        if (farthest && farthest.set !== primary.set) records.push({ key: "distance", label: "Longest distance", text: fmt(farthest.set), date: farthest.date, set: farthest.set });
      }
    }
    if (type === "distance_duration") {
      const longest = pick((a, b) => (a.set.durationSeconds ?? 0) - (b.set.durationSeconds ?? 0));
      if (longest && longest.set !== primary.set && longest.set.durationSeconds) records.push({ key: "duration", label: "Longest time", text: formatDuration(longest.set.durationSeconds), date: longest.date, set: longest.set });
    }
  }

  if (spec.e1rm) {
    let best = null;
    for (const { set, date } of eligible) {
      const e = estimate1RM(set.weight, set.reps);
      if (e != null && (!best || e > best.value)) best = { value: e, set, date };
    }
    if (best) records.push({ key: "e1rm", label: "Est. 1RM", text: `${Math.round(best.value)}${opts.unit || "kg"}`, date: best.date, set: best.set, estimated: true });
  }

  if (spec.volume === "load") {
    let best = null;
    for (const s of sessions.filter((x) => x.type === type)) {
      const v = s.entry.sets.filter((x) => isWorkingSet(x) && isSetComplete(x, type)).reduce((n, x) => n + (setVolume(x, type) || 0), 0);
      if (v > 0 && (!best || v > best.value)) best = { value: v, date: s.date };
    }
    if (best) records.push({ key: "volume", label: "Volume", text: `${Math.round(best.value)}${opts.unit || "kg"}`, date: best.date });
  }

  return { type, records, headline: records[0]?.text ?? null, hasData: eligible.length > 0 };
}

/** Chart metrics available for a measurement type (never offers a 1RM for a plank). */
export function metricsForType(type, unit = "kg") {
  switch (type) {
    case "weight_reps":
    case "per_side_weight":
      return [
        { key: "weight", label: "Top Weight", unit, color: "var(--steel)" },
        { key: "1rm", label: "Est. 1RM", unit, color: "var(--brass)" },
        { key: "volume", label: "Session Volume", unit, color: "var(--warn)" },
      ];
    case "bodyweight_plus_weight":
      return [
        { key: "weight", label: "Added Weight", unit, color: "var(--steel)" },
        { key: "reps", label: "Best Reps", unit: "reps", color: "var(--brass)" },
        { key: "volume", label: "Session Volume", unit, color: "var(--warn)" },
      ];
    case "bodyweight_reps":
    case "reps_only":
      return [{ key: "reps", label: "Best Reps", unit: "reps", color: "var(--brass)" }];
    case "assisted_bodyweight":
      return [
        { key: "assist", label: "Assistance", unit, color: "var(--steel)", lowerIsBetter: true },
        { key: "reps", label: "Best Reps", unit: "reps", color: "var(--brass)" },
      ];
    case "duration":
    case "isometric_hold":
      return [{ key: "seconds", label: "Longest Hold", unit: "s", color: "var(--brass)" }];
    case "weighted_duration":
      return [
        { key: "weight", label: "Weight", unit, color: "var(--steel)" },
        { key: "seconds", label: "Longest Hold", unit: "s", color: "var(--brass)" },
      ];
    case "distance_duration":
      return [
        { key: "distance", label: "Distance", unit: "m", color: "var(--steel)" },
        { key: "seconds", label: "Time", unit: "s", color: "var(--brass)" },
      ];
    case "weight_distance":
      return [
        { key: "weight", label: "Weight", unit, color: "var(--steel)" },
        { key: "distance", label: "Distance", unit: "m", color: "var(--brass)" },
      ];
    default:
      return [];
  }
}

/** One point per session for the selected exercise. `date` is the raw local date string. */
export function strengthSeries(workouts, name, customExercises) {
  const sessions = entriesFor(workouts, name, customExercises);
  const type = typeOfExercise(workouts, name, customExercises);
  const points = [];
  for (const s of sessions) {
    if (s.type !== type) continue;
    const sets = s.complete.filter(isWorkingSet);
    if (sets.length === 0) continue;
    const p = { date: s.date };
    const max = (f) => tolerantMax(sets.map((x) => x[f]).filter(Number.isFinite));
    if (sets.some((x) => Number.isFinite(x.weight))) p.weight = Math.round(max("weight") * 100) / 100;
    if (sets.some((x) => Number.isFinite(x.reps))) p.reps = max("reps");
    if (specFor(type).e1rm) {
      const e = tolerantMax(sets.map((x) => estimate1RM(x.weight, x.reps)).filter((v) => v != null));
      if (Number.isFinite(e)) p["1rm"] = Math.round(e);
    }
    if (specFor(type).volume === "load") p.volume = Math.round(sets.reduce((n, x) => n + (setVolume(x, type) || 0), 0));
    if (sets.some((x) => Number.isFinite(x.durationSeconds))) p.seconds = max("durationSeconds");
    if (sets.some((x) => Number.isFinite(x.distanceMeters))) p.distance = max("distanceMeters");
    if (type === "assisted_bodyweight") p.assist = Math.min(...sets.map((x) => x.assistWeight || 0));
    points.push(p);
  }
  return { type, metrics: metricsForType(type), points };
}

/** Sparkline values for an exercise's primary metric over its last sessions. */
export function sparklineValues(workouts, name, customExercises, limit = 10) {
  const { metrics, points } = strengthSeries(workouts, name, customExercises);
  const key = metrics[0]?.key;
  if (!key) return [];
  return points.map((p) => p[key]).filter(Number.isFinite).slice(-limit);
}

/** Chronological PR feed, newest first. Detail text comes from the set's own type — no NaN. */
export function prTimeline(workouts, customExercises, { limit = 12, unit = "kg" } = {}) {
  return allTimePrEvents(workouts, customExercises)
    .map((ev) => ({
      name: ev.name, date: ev.date, kind: ev.type,
      detail: formatSet(ev.set, ev.trackingType, { unit }),
      label: { weight: "New weight PR", reps: "New rep PR", duration: "New duration PR", distance: "New distance PR", assistance: "Less assistance" }[ev.type] || "New PR",
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit);
}

/** Same events, oldest first, for month filters. */
export function historicalPrEvents(workouts, customExercises, { unit = "kg" } = {}) {
  return allTimePrEvents(workouts, customExercises).map((ev) => ({
    name: ev.name, date: ev.date, kind: ev.type, detail: formatSet(ev.set, ev.trackingType, { unit }),
  }));
}

/** Best weight for a lift among PR-eligible weight x reps sets (strength ranking / transformation). */
export function bestWeightFor(workouts, name, customExercises) {
  let best = 0;
  for (const s of entriesFor(workouts, name, customExercises)) {
    if (!specFor(s.type).e1rm) continue;
    for (const set of s.entry.sets || []) if (isPrEligible(set) && isSetComplete(set, s.type) && set.weight > best) best = set.weight;
  }
  return best || null;
}

/** Earliest vs latest top weight for a lift across sessions with real working data. */
export function liftChange(workouts, name, customExercises) {
  const sessions = entriesFor(workouts, name, customExercises)
    .map((s) => ({ ...s, top: tolerantMax(s.complete.filter((x) => isWorkingSet(x) && Number.isFinite(x.weight)).map((x) => x.weight)) }))
    .filter((s) => Number.isFinite(s.top) && s.top > 0);
  if (sessions.length < 2) return null;
  return +(sessions[sessions.length - 1].top - sessions[0].top).toFixed(1);
}

/** Tonnage per coarse muscle group over [startIso, endIso] (working sets, tonnage-eligible types only). */
export function muscleVolumeInRange(workouts, customExercises, startIso, endIso) {
  const totals = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0]));
  for (const w of workouts || []) {
    if (w.date < startIso || w.date > endIso) continue;
    for (const e of w.exercises || []) {
      const ex = findExercise(e.name, customExercises);
      if (!ex) continue;
      const type = effectiveTrackingType(e, ex.trackingType);
      const v = (e.sets || []).filter((s) => isWorkingSet(s) && isSetComplete(s, type)).reduce((n, s) => n + (setVolume(s, type) || 0), 0);
      totals[ex.muscle] = (totals[ex.muscle] || 0) + v;
    }
  }
  return MUSCLE_GROUPS.map((m) => ({ muscle: m, volume: Math.round(totals[m]) }));
}

export function weeklyMuscleVolume(workouts, customExercises, { now = Date.now(), timeZone } = {}) {
  const todayIso = localToday(now, timeZone);
  return muscleVolumeInRange(workouts, customExercises, addDays(todayIso, -6), todayIso);
}

/** Calendar-style grid of the last `weeks` weeks (Sun-Sat), oldest first. `count` = working sets. */
export function consistencyGrid(workouts, weeks = 12, { now = Date.now(), timeZone } = {}) {
  const setsByDate = new Map();
  for (const w of workouts || []) {
    const n = (w.exercises || []).reduce((acc, e) => acc + workingSets(e).length, 0);
    setsByDate.set(w.date, (setsByDate.get(w.date) || 0) + n);
  }
  const todayIso = localToday(now, timeZone);
  const end = addDays(todayIso, 6 - dayOfWeek(todayIso));
  const days = [];
  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const iso = addDays(end, -i);
    days.push({ date: iso, count: setsByDate.get(iso) || 0, future: iso > todayIso });
  }
  return days;
}

/* ------------------------------ month helpers ------------------------------ */

export function monthRange(monthKey, { now = Date.now(), timeZone } = {}) {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n) => String(n).padStart(2, "0");
  return {
    startIso: `${year}-${pad(month)}-01`,
    endIso: `${year}-${pad(month)}-${pad(daysInMonth)}`,
    daysInMonth,
    label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }),
    isCurrentMonth: monthKey === localToday(now, timeZone).slice(0, 7),
  };
}

export function shiftMonthKey(monthKey, delta) {
  const [year, month] = monthKey.split("-").map(Number);
  const idx = year * 12 + (month - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function sessionsPerWeek(workouts, limit = 8) {
  const byWeek = new Map();
  for (const w of workouts || []) {
    const key = startOfWeek(w.date);
    byWeek.set(key, (byWeek.get(key) || 0) + 1);
  }
  return [...byWeek.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(-limit);
}

export { daysBetween };
