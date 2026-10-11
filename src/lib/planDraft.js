// Generated-plan drafts. A plan the Coach generates is a DRAFT: it is saved the moment it is
// generated (so a refresh, navigation or reopening restores it without regenerating — and without
// being charged again), kept separate from the ACTIVE plan the athlete trains from, and only becomes
// active through an explicit activation. Pure helpers; persistence is the caller's (key
// "atlas:planDraft").
//
// Also normalises what the model returns so a plan can never carry a rep range for a timed hold
// (a generated "Plank 3 x 8-12" used to flow straight into the workout), or a hold time for a
// rep-based lift, and so exercise names resolve to catalogue exercises (and therefore to the right
// measurement type) when the session is built.

import { findExercise } from "./exerciseLookup.js";
import { EXERCISES } from "../exerciseData.js";
import { parseTargetRange, DEFAULT_DURATION_RANGE, GOAL_REP_RANGES } from "./progression.js";

export const PLAN_DRAFT_VERSION = 1;
const TIMED = new Set(["duration", "isometric_hold", "weighted_duration"]);
const NO_REPS = new Set(["distance_duration", "weight_distance"]);

const byLowerName = new Map(EXERCISES.map((e) => [e.name.toLowerCase(), e]));

/** Exact name / alias, else a conservative containment match, else null (never a wild guess). */
export function resolvePlanExercise(name, customExercises = []) {
  if (typeof name !== "string" || !name.trim()) return null;
  const exact = findExercise(name, customExercises);
  if (exact) return exact;
  const lower = name.toLowerCase().trim();
  if (lower.length < 4) return null;
  const contained = EXERCISES.filter((e) => e.name.toLowerCase().includes(lower) || lower.includes(e.name.toLowerCase()));
  if (contained.length === 1) return contained[0];
  // several candidates: prefer the one whose name is closest in length (most specific match)
  if (contained.length > 1) return contained.sort((a, b) => Math.abs(a.name.length - lower.length) - Math.abs(b.name.length - lower.length))[0];
  return byLowerName.get(lower) || null;
}

/** A valid default target string for an exercise type. */
export function defaultTargetFor(trackingType, goal) {
  if (TIMED.has(trackingType)) return `${DEFAULT_DURATION_RANGE[0]}-${DEFAULT_DURATION_RANGE[1]}s`;
  if (NO_REPS.has(trackingType)) return "";
  const [lo, hi] = GOAL_REP_RANGES[goal] || GOAL_REP_RANGES.general;
  return `${lo}-${hi}`;
}

/**
 * Cleans a model-generated (or hand-edited) list of plan days:
 *  - names resolve to catalogue exercises (canonical spelling), recorded as `exerciseName`/`unmatched`;
 *  - the target matches the exercise's measurement type (seconds for holds, reps for lifts);
 *  - sets is a sane whole number; empty groups/days are dropped.
 * Returns { days, changes } where `changes` lists every correction made (for transparency/tests).
 */
export function normalizePlanDays(days, { goal, customExercises = [] } = {}) {
  const changes = [];
  const out = [];
  for (const day of Array.isArray(days) ? days : []) {
    if (!day || !Array.isArray(day.muscleGroups)) continue;
    const groups = [];
    for (const mg of day.muscleGroups) {
      if (!mg || !Array.isArray(mg.exercises)) continue;
      const exercises = [];
      for (const e of mg.exercises) {
        if (!e || typeof e.name !== "string" || !e.name.trim()) continue;
        const meta = resolvePlanExercise(e.name, customExercises);
        const name = meta ? meta.name : e.name.trim();
        if (meta && meta.name !== e.name) changes.push(`"${e.name}" -> "${meta.name}"`);
        const type = meta?.trackingType || "weight_reps";
        let sets = Math.round(Number(e.sets));
        if (!Number.isFinite(sets) || sets < 1) { sets = 3; changes.push(`${name}: sets defaulted to 3`); }
        if (sets > 12) { sets = 12; changes.push(`${name}: sets capped at 12`); }
        let reps = typeof e.reps === "number" ? String(e.reps) : String(e.reps ?? "").trim();
        const parsed = parseTargetRange(reps);
        const wantsSeconds = TIMED.has(type);
        if (NO_REPS.has(type)) {
          if (reps) changes.push(`${name}: removed a rep target (this exercise is logged by distance/time)`);
          reps = "";
        } else if (!parsed || (wantsSeconds && parsed.unit !== "seconds") || (!wantsSeconds && parsed.unit !== "reps")) {
          const replacement = defaultTargetFor(type, goal);
          if (reps !== replacement) changes.push(`${name}: target "${reps || "(none)"}" replaced with "${replacement}"`);
          reps = replacement;
        }
        exercises.push({ name, sets, reps, ...(meta ? {} : { unmatched: true }) });
      }
      if (exercises.length) groups.push({ muscle: mg.muscle, exercises });
    }
    if (groups.length) out.push({ day: String(day.day || `Day ${out.length + 1}`), muscleGroups: groups });
  }
  return { days: out, changes };
}

export function newDraftId() {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().slice(0, 12); } catch (e) { /* fall through */ }
  return Math.random().toString(36).slice(2, 14);
}

export function createDraft({ days, goal, coachingStyle, customExercises = [], now = Date.now(), id = newDraftId() }) {
  const { days: clean, changes } = normalizePlanDays(days, { goal, customExercises });
  return { version: PLAN_DRAFT_VERSION, id, status: "draft", createdAt: now, updatedAt: now, goal: goal || null, coachingStyle: coachingStyle || null, days: clean, normalization: changes };
}

export function isValidDraft(d) {
  return !!d && typeof d === "object" && typeof d.id === "string" && Array.isArray(d.days) && d.days.length > 0
    && d.days.every((day) => day && Array.isArray(day.muscleGroups) && day.muscleGroups.every((mg) => Array.isArray(mg?.exercises)));
}

/** Replaces a draft's days (after the athlete edits it), normalised, keeping its identity. */
export function updateDraftDays(draft, days, { goal, customExercises = [], now = Date.now() } = {}) {
  const { days: clean, changes } = normalizePlanDays(days, { goal: goal || draft.goal, customExercises });
  return { ...draft, days: clean, updatedAt: now, normalization: changes };
}

/** The active plan Home/Train run from. Activation is explicit; the draft id is kept for traceability. */
export function activePlanFromDraft(draft, { now = Date.now() } = {}) {
  return { days: draft.days, currentDayIndex: 0, activatedAt: new Date(now).toISOString(), sourceDraftId: draft.id };
}

/** Structural equality used for unsaved-edit detection. */
export function daysEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
