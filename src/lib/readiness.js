// Muscle readiness: an honest, deliberately modest estimate.
//
// The old model marked a region "Fatigued" for 24 hours after ANY logged exercise that touched it,
// counted empty exercises and warm-ups, treated a 30-second plank like a heavy bench session, and
// measured time from UTC midnight of the stored date. A single light warm-up set plus a plank
// turned several regions red.
//
// What this does instead:
//   * Only complete WORKING sets count (warm-ups never; deload sets at half weight; an exercise
//     added but never logged counts for nothing).
//   * Each set contributes workload "units" by what it is: a rep set or a loaded set is 1, a timed
//     hold is its seconds relative to a 45 s reference (never more than 1, never less than 0.25).
//     Primary muscles get the full units, secondary muscles a fraction.
//   * Time since is measured from the workout's real instant when it has one, from local noon of
//     its date when it does not (and never claims more than "recently trained" off a date alone).
//   * The recovery estimate scales with workload. Only a substantial session (>= 4 units, with a
//     little carry-over from other sessions in the last 3 days) is allowed to read "Fatigued" or
//     "Partially recovered". Light or moderate work is the neutral "Recently trained". A region with
//     nothing logged is "Insufficient data", never a guess.
//   * The estimate says what it is: based on logged working sets and elapsed time, not on sleep,
//     soreness or effort, and not a medical measurement.

import { READINESS_MUSCLE_IDS, regionForExercise } from "../exerciseData.js";
import { findExercise } from "./exerciseLookup.js";
import { effectiveTrackingType, isSetComplete, isWorkingSet, setKind, SET_KIND_RULES } from "./measurement.js";
import { workoutInstant } from "./dates.js";

export const SECONDARY_WEIGHT = 0.4;
export const HOLD_REFERENCE_SECONDS = 45;
export const HOURS_7D = 168;
const MS_PER_HOUR = 3600000;

export const READINESS_EXPLAINER =
  "Estimated from your logged working sets and the time since — warm-up sets and exercises you didn't log are ignored. It can't know your sleep, soreness or how hard the sets felt, and it isn't a medical measurement.";

/** Workload units for one stored set (0 if it is not a complete working set). */
export function setWorkloadUnits(set, type) {
  if (!isSetComplete(set, type) || !isWorkingSet(set)) return 0;
  const factor = SET_KIND_RULES[setKind(set)].workload;
  if (type === "duration" || type === "isometric_hold" || type === "weighted_duration") {
    return factor * Math.min(1, Math.max(0.25, (set.durationSeconds || 0) / HOLD_REFERENCE_SECONDS));
  }
  if (type === "distance_duration") {
    const minutes = (set.durationSeconds || 0) / 60;
    return factor * Math.min(1, Math.max(0.25, minutes / 20));
  }
  return factor;
}

/** Hours to recover as a function of workload units in the most recent session. */
export function recoveryHoursFor(units) {
  if (units < 2) return 12;
  return Math.min(72, 24 + 8 * (units - 2));
}

const roundTo = (n, step) => Math.round(n / step) * step;

export function computeReadiness(workouts, customExercises = [], { now = Date.now(), timeZone } = {}) {
  const status = {};
  READINESS_MUSCLE_IDS.forEach((id) => {
    status[id] = { hours: Infinity, lastDate: null, recentSets: 0, recentSessions: 0, workloadUnits: 0, lastSessionUnits: 0, lastSessionSets: 0, via: null, precision: null, hoursUntilReady: null, recoveryPercent: null };
  });

  // region -> [{ ms, precision, units, sets, primary }]
  const sessionsByRegion = {};
  for (const w of workouts || []) {
    const inst = workoutInstant(w, timeZone);
    if (!Number.isFinite(inst.ms)) continue;
    const perRegion = {};
    const add = (region, units, sets, primary) => {
      if (!region || !status[region]) return;
      const r = (perRegion[region] ||= { units: 0, sets: 0, primary: false });
      r.units += units;
      r.sets += sets;
      r.primary = r.primary || primary;
    };
    for (const entry of w.exercises || []) {
      const ex = findExercise(entry?.name, customExercises);
      if (!ex) continue;
      const type = effectiveTrackingType(entry, ex.trackingType);
      let units = 0;
      let sets = 0;
      for (const s of entry.sets || []) {
        const u = setWorkloadUnits(s, type);
        if (u > 0) { units += u; sets += 1; }
      }
      if (units <= 0) continue;
      add(regionForExercise(ex), units, sets, true);
      for (const sec of ex.secondaryMuscles || []) add(sec, units * SECONDARY_WEIGHT, 0, false);
    }
    for (const [region, r] of Object.entries(perRegion)) {
      (sessionsByRegion[region] ||= []).push({ ms: inst.ms, precision: inst.precision, date: w.date, ...r });
    }
  }

  for (const id of READINESS_MUSCLE_IDS) {
    const s = status[id];
    const sessions = (sessionsByRegion[id] || []).sort((a, b) => b.ms - a.ms);
    if (sessions.length === 0) { s.level = "unknown"; continue; }
    const last = sessions[0];
    const hours = Math.max(0, (now - last.ms) / MS_PER_HOUR);
    s.hours = hours;
    s.lastDate = last.date;
    s.precision = last.precision;
    s.lastSessionUnits = last.units;
    s.lastSessionSets = last.sets;
    s.via = last.primary ? "primary" : "secondary";
    s.recentSessions = sessions.filter((x) => x.primary && now - x.ms <= HOURS_7D * MS_PER_HOUR).length;
    s.recentSets = sessions.filter((x) => now - x.ms <= HOURS_7D * MS_PER_HOUR).reduce((n, x) => n + x.sets, 0);
    // Carry-over: other sessions in the 3 days before the latest add half their units.
    const carry = sessions.slice(1).filter((x) => last.ms - x.ms <= 72 * MS_PER_HOUR).reduce((n, x) => n + x.units, 0) * 0.5;
    const units = last.units + carry;
    s.workloadUnits = units;
    const R = recoveryHoursFor(units);
    const fraction = hours / R;
    s.hoursUntilReady = Math.max(0, roundTo(R - hours, 6));

    const substantial = units >= 4 && last.precision === "instant";
    if (hours >= R) s.level = "ready";
    else if (substantial && fraction < 0.5) s.level = "fatigued";
    else if (substantial) s.level = "partial";
    else s.level = "recent";
  }
  return status;
}
