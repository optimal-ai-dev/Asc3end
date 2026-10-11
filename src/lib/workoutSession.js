// Pure operations on the in-progress workout session. The logger UI only ever calls these, so the
// rules (no duplicate exercises, superset order and rest, swap compatibility, undoable deletes,
// stable ids) are unit-tested without rendering anything.
//
// Session shape (all new fields are optional so sessions persisted before this existed still load;
// normalizeSession() fills them in):
//   { id, date, timeZone, unit, startedAt, updatedAt, restEndAt, restDefaultSeconds, notes,
//     planDayName, plannedDayIndex,
//     exercises: [{ id, name, exerciseId, trackingType, equipment, laterality,
//                   sets: [{ id, ...measurementFields, type, rpe?, rir?, completedAt }],
//                   targetSets, targetReps, restSeconds, note, supersetWith (partner id) }] }

import { findExercise, exerciseId as lookupExerciseId } from "./exerciseLookup.js";
import { effectiveTrackingType, isSetComplete, isWorkingSet, setVolume } from "./measurement.js";
import { newTimestamp } from "./dates.js";

export const DEFAULT_REST_SECONDS = 90;
export const REST_OPTIONS = [30, 45, 60, 90, 120, 180, 240];

export function newId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().slice(0, 12);
  } catch (e) { /* fall through */ }
  return Math.random().toString(36).slice(2, 14);
}

const touch = (s, now = Date.now()) => ({ ...s, updatedAt: now });

/** Builds a session exercise from a catalogue/custom exercise. The measurement type is captured
 *  NOW and stored, so later catalogue changes can never reinterpret what was logged. */
export function exerciseEntry(ex, { targetSets, targetReps, id = newId(), customExercises = [] } = {}) {
  const meta = ex?.name ? (findExercise(ex.name, customExercises) || ex) : ex;
  return {
    id,
    name: meta.name,
    exerciseId: lookupExerciseId(meta.name, customExercises) || meta.id || null,
    trackingType: meta.trackingType || "weight_reps",
    equipment: meta.equipment || null,
    laterality: meta.laterality || null,
    sets: [],
    supersetWith: null,
    ...(targetSets != null ? { targetSets } : {}),
    ...(targetReps != null ? { targetReps: String(targetReps) } : {}),
  };
}

export function createSession({ planDay = null, plannedDayIndex = null, now = Date.now(), timeZone, unit = "kg", customExercises = [], id = newId() } = {}) {
  const stamp = newTimestamp(now, timeZone);
  const exercises = planDay
    ? planDay.muscleGroups.flatMap((mg) => mg.exercises.map((e) => exerciseEntry({ name: e.name, ...(findExercise(e.name, customExercises) || {}) }, {
        targetSets: e.sets, targetReps: e.reps, customExercises,
      })))
    : [];
  return {
    id, ...stamp, unit, updatedAt: now, restEndAt: null, restDefaultSeconds: DEFAULT_REST_SECONDS,
    exercises, planDayName: planDay?.day || null, plannedDayIndex: plannedDayIndex ?? null,
  };
}

/** Upgrades a persisted session (older shape) in place of crashing on missing fields. */
export function normalizeSession(session, customExercises = []) {
  if (!session || typeof session !== "object") return session;
  const exercises = (session.exercises || []).map((e) => {
    const meta = findExercise(e.name, customExercises);
    return {
      ...e,
      id: e.id || newId(),
      exerciseId: e.exerciseId ?? lookupExerciseId(e.name, customExercises),
      trackingType: e.trackingType || effectiveTrackingType(e, meta?.trackingType),
      equipment: e.equipment ?? meta?.equipment ?? null,
      laterality: e.laterality ?? meta?.laterality ?? null,
      sets: (e.sets || []).map((s) => (s && !s.id ? { ...s, id: newId() } : s)),
    };
  });
  // Legacy superset links were stored as the partner's NAME; links are ids now.
  const byName = new Map(exercises.map((e) => [e.name, e.id]));
  const byId = new Set(exercises.map((e) => e.id));
  const linked = exercises.map((e) => {
    const link = e.supersetWith;
    return { ...e, supersetWith: link && (byId.has(link) ? link : byName.get(link) || null) };
  });
  return { ...session, exercises: linked, restDefaultSeconds: session.restDefaultSeconds || DEFAULT_REST_SECONDS, updatedAt: session.updatedAt ?? session.startedAt };
}

const mapEx = (s, id, fn) => ({ ...s, exercises: s.exercises.map((e) => (e.id === id ? fn(e) : e)) });

/** Adds several exercises at once; anything already in the session is skipped, not duplicated. */
export function addExercises(session, exercises, { now = Date.now(), customExercises = [] } = {}) {
  const have = new Set(session.exercises.map((e) => e.name));
  const added = [];
  for (const ex of exercises) {
    if (have.has(ex.name)) continue;
    have.add(ex.name);
    added.push(exerciseEntry(ex, { customExercises }));
  }
  return { session: added.length ? touch({ ...session, exercises: [...session.exercises, ...added] }, now) : session, added };
}

export function removeExercise(session, id, { now = Date.now() } = {}) {
  const removed = session.exercises.find((e) => e.id === id);
  if (!removed) return { session, removed: null };
  const exercises = session.exercises.filter((e) => e.id !== id).map((e) => (e.supersetWith === id ? { ...e, supersetWith: null } : e));
  return { session: touch({ ...session, exercises }, now), removed, index: session.exercises.indexOf(removed) };
}

export function restoreExercise(session, entry, index, { now = Date.now() } = {}) {
  const exercises = [...session.exercises];
  exercises.splice(Math.min(index, exercises.length), 0, entry);
  return touch({ ...session, exercises }, now);
}

export function moveExercise(session, id, delta, { now = Date.now() } = {}) {
  const i = session.exercises.findIndex((e) => e.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= session.exercises.length) return session;
  const exercises = [...session.exercises];
  [exercises[i], exercises[j]] = [exercises[j], exercises[i]];
  return touch({ ...session, exercises }, now);
}

/** Replaces one exercise with another, keeping its place, plan targets, note, rest and superset
 *  link, so an unavailable machine never means rebuilding the workout. Logged sets carry over only
 *  if they are still valid under the new exercise's measurement type; otherwise they are listed in
 *  `dropped` so the UI can say so before committing. */
export function swapExercise(session, id, newEx, { now = Date.now(), customExercises = [] } = {}) {
  const old = session.exercises.find((e) => e.id === id);
  if (!old) return { session, dropped: [] };
  if (session.exercises.some((e) => e.id !== id && e.name === newEx.name)) return { session, dropped: [], duplicate: true };
  const fresh = exerciseEntry(newEx, { customExercises, id });
  const kept = old.sets.filter((s) => isSetComplete(s, fresh.trackingType));
  const dropped = old.sets.filter((s) => !isSetComplete(s, fresh.trackingType));
  const next = {
    ...fresh,
    sets: kept,
    supersetWith: old.supersetWith,
    swappedFrom: old.swappedFrom || old.name,
    ...(old.targetSets != null ? { targetSets: old.targetSets } : {}),
    ...(old.targetReps != null && fresh.trackingType === old.trackingType ? { targetReps: old.targetReps } : {}),
    ...(old.restSeconds != null ? { restSeconds: old.restSeconds } : {}),
    ...(old.note ? { note: old.note } : {}),
  };
  return { session: touch(mapEx(session, id, () => next), now), dropped };
}

export function setExerciseNote(session, id, note, { now = Date.now() } = {}) {
  return touch(mapEx(session, id, (e) => ({ ...e, note: String(note).slice(0, 500) })), now);
}

export function setExerciseRest(session, id, seconds, { now = Date.now() } = {}) {
  const s = Number(seconds);
  return touch(mapEx(session, id, (e) => (Number.isFinite(s) && s > 0 ? { ...e, restSeconds: Math.round(s) } : (() => { const { restSeconds, ...rest } = e; return rest; })())), now);
}

export function restSecondsFor(session, ex) {
  return ex?.restSeconds || session.restDefaultSeconds || DEFAULT_REST_SECONDS;
}

/** Links/unlinks two exercises as a superset (symmetric, and a given exercise is in at most one pair). */
export function toggleSuperset(session, aId, bId, { now = Date.now() } = {}) {
  const a = session.exercises.find((e) => e.id === aId);
  if (!a || aId === bId) return session;
  const alreadyLinked = a.supersetWith === bId;
  const exercises = session.exercises.map((e) => {
    if (e.id === aId) return { ...e, supersetWith: alreadyLinked ? null : bId };
    if (e.id === bId) return { ...e, supersetWith: alreadyLinked ? null : aId };
    if (!alreadyLinked && (e.supersetWith === aId || e.supersetWith === bId)) return { ...e, supersetWith: null };
    return e;
  });
  return touch({ ...session, exercises }, now);
}

/** In a superset the exercise that comes first in the workout is the "lead": no rest after it —
 *  the athlete goes straight to the partner — and the rest timer starts after the partner. */
export function supersetRole(session, id) {
  const i = session.exercises.findIndex((e) => e.id === id);
  const e = session.exercises[i];
  if (!e?.supersetWith) return null;
  const j = session.exercises.findIndex((x) => x.id === e.supersetWith);
  if (j < 0) return null;
  return i < j ? "lead" : "follow";
}

/** Logs one validated set. Returns the new session plus what the UI should do next. */
export function logSet(session, id, set, { now = Date.now() } = {}) {
  const ex = session.exercises.find((e) => e.id === id);
  if (!ex) return { session, startedRest: false, next: null };
  const entry = { id: newId(), type: "normal", ...set, completedAt: now };
  const role = supersetRole(session, id);
  const partner = ex.supersetWith ? session.exercises.find((e) => e.id === ex.supersetWith) : null;
  let restEndAt = session.restEndAt;
  let startedRest = false;
  if (role !== "lead") {
    const seconds = Math.max(restSecondsFor(session, ex), partner ? restSecondsFor(session, partner) : 0);
    restEndAt = now + seconds * 1000;
    startedRest = true;
  }
  const next = role === "lead" ? partner?.id ?? null : null;
  const updated = mapEx({ ...session, restEndAt }, id, (e) => ({ ...e, sets: [...e.sets, entry] }));
  return { session: touch(updated, now), startedRest, next, set: entry };
}

export function updateSet(session, id, setId, patch, { now = Date.now() } = {}) {
  return touch(mapEx(session, id, (e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) })), now);
}

export function removeSet(session, id, setId, { now = Date.now() } = {}) {
  const ex = session.exercises.find((e) => e.id === id);
  const index = ex ? ex.sets.findIndex((s) => s.id === setId) : -1;
  if (index < 0) return { session, removed: null };
  const removed = ex.sets[index];
  return { session: touch(mapEx(session, id, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) })), now), removed, index };
}

export function restoreSet(session, id, set, index, { now = Date.now() } = {}) {
  return touch(mapEx(session, id, (e) => {
    const sets = [...e.sets];
    sets.splice(Math.min(index, sets.length), 0, set);
    return { ...e, sets };
  }), now);
}

export function clearRest(session, { now = Date.now() } = {}) {
  return touch({ ...session, restEndAt: null }, now);
}

export function adjustRest(session, deltaSeconds, { now = Date.now() } = {}) {
  if (!session.restEndAt) return session;
  return touch({ ...session, restEndAt: Math.max(now, session.restEndAt + deltaSeconds * 1000) }, now);
}

/** Done/planned counts for the "2 of 4 sets" display and for the finish-time incompleteness warning. */
export function setProgress(ex) {
  const done = (ex.sets || []).length;
  const planned = ex.targetSets || 0;
  return { done, planned, remaining: Math.max(0, planned - done), complete: planned > 0 && done >= planned };
}

export function sessionTotals(session, customExercises = []) {
  let sets = 0, volume = 0;
  for (const e of session.exercises) {
    const type = effectiveTrackingType(e, findExercise(e.name, customExercises)?.trackingType);
    for (const s of e.sets) {
      if (!isSetComplete(s, type) || !isWorkingSet(s)) continue;
      sets++;
      volume += setVolume(s, type) || 0;
    }
  }
  return { sets, volume };
}

export const hasLoggedSets = (session) => (session?.exercises || []).some((e) => (e.sets || []).length > 0);

/** The workout record persisted to history: everything durable, nothing that is live-UI state. */
export function finalizeSession(session, { now = Date.now(), xpBreakdown, prs = [], timeZone } = {}) {
  const { restEndAt, restDefaultSeconds, ...rest } = session;
  return {
    ...rest,
    timeZone: session.timeZone || timeZone,
    completedAt: new Date(now).toISOString(),
    updatedAt: now,
    xpBreakdown,
    prs,
  };
}
