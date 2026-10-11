// Deterministic progression engine. Decides the next target for one exercise from logged
// history, and says why. Used by the workout logger, the Coach's server-side context and the
// plan screen, so every surface shows the same number.
//
// Eligibility rules (the audit's warm-up bug: a 20 kg x 5 warm-up became the "baseline"):
//   * Only baseline-eligible sets (normal, failure — plus legacy untyped sets) define the baseline.
//   * Warm-up, drop-set and deload sets are recorded and may count toward workload, but never
//     replace a working baseline.
//   * A session with no eligible set for the exercise (empty, warm-up-only, deload-only) is
//     skipped entirely, so the latest QUALIFYING session stays the baseline.
//   * Everything is recomputed from `workouts` on every call, so correcting a historical set
//     changes the next recommendation immediately. There is no cached recommendation to go stale.

import {
  effectiveTrackingType, isSetComplete, isBaselineEligible, estimate1RM, formatSet, formatDuration, specFor,
} from "./measurement.js";
import { workoutInstant } from "./dates.js";

export const GOAL_REP_RANGES = {
  muscle_growth: [8, 12],
  strength: [4, 6],
  fat_loss: [10, 15],
  general: [8, 12],
};

// Timed holds and cardio have no rep range; these are default hold windows in seconds.
export const DEFAULT_DURATION_RANGE = [30, 60];

// Smallest practical jump per equipment type (kg). Overridable through `opts.increments`.
export const DEFAULT_INCREMENTS_KG = {
  Barbell: 2.5, "Smith Machine": 2.5, "Trap Bar": 2.5, Landmine: 2.5, Dumbbell: 2, Kettlebell: 4,
  Cable: 2.5, Machine: 5, "Selectorized Machine": 5, "Plate-Loaded Machine": 5,
  Bodyweight: 1.25, "Assisted Bodyweight": 2.5, default: 2.5,
};
const LB_PER_KG = 2.20462;

export function incrementFor(equipment, unit = "kg", overrides = null) {
  const kg = overrides?.[equipment] ?? DEFAULT_INCREMENTS_KG[equipment] ?? DEFAULT_INCREMENTS_KG.default;
  if (unit === "lb") return overrides?.[equipment] != null ? kg : Math.max(2.5, Math.round((kg * LB_PER_KG) / 2.5) * 2.5);
  return kg;
}

const roundTo = (v, step) => Math.round(v / step) * step;
const clean = (n) => Math.round(n * 100) / 100;

/** "8-12" -> {lo:8,hi:12}; "10" -> {lo:10,hi:10}; "30-45s"/"45 sec"/"1 min" -> seconds. Null if unreadable. */
export function parseTargetRange(raw) {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return { lo: raw, hi: raw, unit: "reps" };
  if (typeof raw === "object" && Number.isFinite(raw.lo) && Number.isFinite(raw.hi)) return { lo: raw.lo, hi: raw.hi, unit: raw.unit || "reps" };
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase().replace(/[–—]/g, "-");
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:-|to)?\s*(\d+(?:\.\d+)?)?\s*(s|sec|secs|seconds?|m|min|mins|minutes?)?(?:\s*reps?)?$/);
  if (!m) return null;
  let lo = Number(m[1]);
  let hi = m[2] != null ? Number(m[2]) : lo;
  const unitTok = m[3];
  let unit = "reps";
  if (unitTok) {
    unit = "seconds";
    if (/^m/.test(unitTok)) { lo *= 60; hi *= 60; }
  }
  if (!(lo > 0) || !(hi >= lo)) return null;
  return { lo, hi, unit };
}

/** The single source of truth for "what is the current rep/time target" — plan first, then the
 *  athlete's goal, then a sane default for the measurement type. Everything that displays or
 *  reasons about a target must call this. */
export function resolveTarget({ planTarget, trackingType = "weight_reps", goal } = {}) {
  const spec = specFor(trackingType);
  const timed = trackingType === "duration" || trackingType === "isometric_hold" || trackingType === "weighted_duration";
  const parsed = parseTargetRange(planTarget);
  if (timed) {
    if (parsed && parsed.unit === "seconds") return { kind: "seconds", lo: parsed.lo, hi: parsed.hi, source: "plan" };
    // A plan that gave a rep-style range for a timed exercise (e.g. a generated "8-12" for Plank)
    // is not a hold time; it is ignored rather than shown as a nonsensical "8-12 reps".
    return { kind: "seconds", lo: DEFAULT_DURATION_RANGE[0], hi: DEFAULT_DURATION_RANGE[1], source: "default" };
  }
  if (spec.fields.includes("reps")) {
    if (parsed && parsed.unit === "reps") return { kind: "reps", lo: parsed.lo, hi: parsed.hi, source: "plan" };
    const [lo, hi] = GOAL_REP_RANGES[goal] || GOAL_REP_RANGES.general;
    return { kind: "reps", lo, hi, source: GOAL_REP_RANGES[goal] ? "goal" : "default" };
  }
  return { kind: "none", lo: null, hi: null, source: "default" };
}

export function describeTarget(t) {
  if (!t || t.kind === "none") return "";
  const range = t.lo === t.hi ? `${t.lo}` : `${t.lo}-${t.hi}`;
  return t.kind === "seconds" ? `${range}s` : `${range} reps`;
}

/** Newest-first list of sessions (with their entry for this exercise) that contain at least one
 *  baseline-eligible, complete set. Warm-up-only / empty / deload-only sessions are excluded. */
export function qualifyingSessions(workouts, exerciseName, typeHint, { excludeWorkoutIds = null, timeZone } = {}) {
  const out = [];
  for (const w of workouts || []) {
    if (!w || (excludeWorkoutIds && excludeWorkoutIds.has(w.id))) continue;
    for (const entry of w.exercises || []) {
      if (entry?.name !== exerciseName) continue;
      const type = effectiveTrackingType(entry, typeHint);
      const eligible = (entry.sets || []).filter((s) => isBaselineEligible(s) && isSetComplete(s, type));
      if (eligible.length === 0) continue;
      out.push({ workout: w, entry, type, eligible, order: workoutInstant(w, timeZone).ms });
    }
  }
  return out.sort((a, b) => {
    if (a.workout.date !== b.workout.date) return a.workout.date < b.workout.date ? 1 : -1;
    return (b.order || 0) - (a.order || 0);
  });
}

function sourceOf(session) {
  return { workoutId: session.workout.id ?? null, date: session.workout.date };
}

/**
 * Next-target recommendation for one exercise.
 * @param {object} p
 * @param {object[]} p.workouts            all completed workouts
 * @param {string}   p.exerciseName
 * @param {string}   [p.trackingType]      catalogue/custom type, used when entries predate stored types
 * @param {string}   [p.goal]
 * @param {string|object} [p.planTarget]   e.g. "15-20" or "30-45s"
 * @param {string}   [p.equipment]
 * @param {"kg"|"lb"} [p.unit]
 * @param {object}   [p.increments]        per-equipment overrides, in `unit`
 */
export function computeProgression({ workouts, exerciseName, trackingType = "weight_reps", goal, planTarget, equipment, unit = "kg", increments = null, timeZone } = {}) {
  const sessions = qualifyingSessions(workouts, exerciseName, trackingType, { timeZone });
  const type = sessions[0]?.type || trackingType;
  const target = resolveTarget({ planTarget, trackingType: type, goal });
  const rangeText = describeTarget(target);
  const base = { exerciseName, trackingType: type, target, rangeSource: target.source, unit };

  if (sessions.length === 0) {
    return { ...base, action: "start", source: null, baseline: null, weight: null, text: firstSessionText(type, target, rangeText, planTarget != null) };
  }

  const last = sessions[0];
  const source = sourceOf(last);
  const when = source.date;
  const stepUnit = incrementFor(equipment, unit, increments);
  const spec = specFor(type);
  const priorTarget = last.entry.targetReps ?? last.entry.target ?? null;
  const priorParsed = parseTargetRange(priorTarget);
  const rangeChanged = !!priorParsed && (priorParsed.lo !== target.lo || priorParsed.hi !== target.hi);
  const rangeNote = rangeChanged ? ` Your target changed from ${priorTarget} to ${rangeText.replace(/ reps$/, "")}.` : "";

  // ---- timed holds -----------------------------------------------------------------------
  if (type === "duration" || type === "isometric_hold" || type === "weighted_duration") {
    const weighted = type === "weighted_duration";
    const topWeight = weighted ? Math.max(...last.eligible.map((s) => s.weight)) : null;
    const atTop = weighted ? last.eligible.filter((s) => s.weight === topWeight) : last.eligible;
    const longest = Math.max(...atTop.map((s) => s.durationSeconds));
    const shortest = Math.min(...atTop.map((s) => s.durationSeconds));
    const allHitTop = atTop.every((s) => s.durationSeconds >= target.hi);
    const baseline = { ...source, topWeight, bestSeconds: longest, sets: atTop.length };
    const lead = weighted ? `${topWeight}${unit} for ` : "";
    if (allHitTop) {
      const nextSeconds = Math.min(target.hi + 15, Math.max(target.hi, longest) + 10);
      if (weighted) {
        const nextW = clean(topWeight + stepUnit);
        return { ...base, action: "increase", source, baseline, weight: nextW, targetSeconds: target.lo, text: `Last time (${when}) every hold reached ${target.hi}s at ${topWeight}${unit}. Add weight: ${nextW}${unit} for ${target.lo}s+.${rangeNote}` };
      }
      return { ...base, action: "increase", source, baseline, weight: null, targetSeconds: nextSeconds, text: `Last time (${when}) every hold reached ${target.hi}s. Aim for ${nextSeconds}s, or make it harder (a longer lever or added load).${rangeNote}` };
    }
    const goalSeconds = Math.min(target.hi, Math.max(target.lo, shortest + 5));
    return { ...base, action: "hold", source, baseline, weight: weighted ? topWeight : null, targetSeconds: goalSeconds, text: `Last time (${when}): ${lead}${formatDuration(longest)} best. Aim for ${formatDuration(goalSeconds)} on every hold (target ${target.lo}-${target.hi}s).${rangeNote}` };
  }

  // ---- no strength-style progression exists for pure distance/pace work ----------------------
  if (type === "distance_duration" || type === "weight_distance") {
    const best = last.eligible[last.eligible.length - 1];
    return { ...base, action: "match", source, baseline: { ...source, sets: last.eligible.length }, weight: type === "weight_distance" ? best.weight : null, text: `Last time (${when}): ${formatSet(best, type, { unit })}. Aim to match or beat it.` };
  }

  // ---- assisted: progress by needing LESS assistance ---------------------------------------
  if (type === "assisted_bodyweight") {
    const minAssist = Math.min(...last.eligible.map((s) => s.assistWeight || 0));
    const atMin = last.eligible.filter((s) => (s.assistWeight || 0) === minAssist);
    const allHitTop = atMin.every((s) => s.reps >= target.hi);
    const baseline = { ...source, assistWeight: minAssist, sets: atMin.length };
    if (allHitTop && minAssist > 0) {
      const next = Math.max(0, clean(minAssist - stepUnit));
      return { ...base, action: "increase", source, baseline, weight: null, assistWeight: next, text: `Last time (${when}) every set hit ${target.hi}+ reps with ${minAssist}${unit} of assistance. Reduce assistance to ${next}${unit} and aim for ${target.lo} reps.${rangeNote}` };
    }
    if (allHitTop) return { ...base, action: "increase", source, baseline, weight: null, assistWeight: 0, text: `Last time (${when}) you did ${target.hi}+ unassisted reps. Try an unassisted or weighted version.${rangeNote}` };
    const weakest = Math.min(...atMin.map((s) => s.reps));
    return { ...base, action: "hold", source, baseline, weight: null, assistWeight: minAssist, text: `Last time (${when}): ${weakest}+ reps with ${minAssist}${unit} of assistance. Stay at ${minAssist}${unit} and push for ${Math.min(weakest + 1, target.hi)}+ reps.${rangeNote}` };
  }

  // ---- reps-only / bodyweight reps (incl. a weighted movement logged with no added load) ----
  const bodyweightOnly = type === "bodyweight_plus_weight" && Math.max(0, ...last.eligible.map((s) => s.weight || 0)) === 0;
  if (type === "reps_only" || type === "bodyweight_reps" || bodyweightOnly) {
    const minReps = Math.min(...last.eligible.map((s) => s.reps));
    const maxReps = Math.max(...last.eligible.map((s) => s.reps));
    const added = Math.max(0, ...last.eligible.map((s) => s.weight || 0));
    const allHitTop = last.eligible.every((s) => s.reps >= target.hi);
    const baseline = { ...source, bestReps: maxReps, addedWeight: added, sets: last.eligible.length };
    if (allHitTop) {
      const addText = type !== "reps_only" ? ` Add ${clean(stepUnit)}${unit} or move to a harder variation.` : " Move to a harder variation.";
      return { ...base, action: "increase", source, baseline, weight: type !== "reps_only" ? clean(added + stepUnit) : null, text: `Last time (${when}) every set reached ${target.hi}+ reps.${addText}${rangeNote}` };
    }
    return { ...base, action: "hold", source, baseline, weight: null, text: `Last time (${when}): ${minReps}-${maxReps} reps. Push for ${Math.min(minReps + 1, target.hi)}+ on every set (target ${describeTarget(target)}).${rangeNote}` };
  }

  // ---- weight x reps family (weight_reps, per_side_weight, bodyweight_plus_weight) ----------
  const topWeight = Math.max(...last.eligible.map((s) => s.weight || 0));
  const atTop = last.eligible.filter((s) => (s.weight || 0) === topWeight);
  const minReps = Math.min(...atTop.map((s) => s.reps));
  const bestReps = Math.max(...atTop.map((s) => s.reps));
  const baseline = { ...source, topWeight, sets: atTop.length, minReps, bestReps };
  const allHitTop = atTop.every((s) => s.reps >= target.hi);

  if (allHitTop) {
    const raw = topWeight + Math.max(stepUnit, topWeight * 0.025);
    const nextWeight = clean(roundTo(raw, stepUnit));
    return { ...base, action: "increase", source, baseline, weight: nextWeight, targetReps: target.lo, text: `Last time (${when}) every working set hit ${target.hi}+ reps at ${topWeight}${unit}. Move up to ${nextWeight}${unit} and aim for ${target.lo} reps.${rangeNote}` };
  }

  // Target range moved far from what the last session showed (e.g. a plan asking for 15-20 after
  // sets of 10): re-estimate the load for the new range from the best set instead of
  // pretending the old weight still fits.
  const farBelow = minReps < target.lo - 2;
  const farAbove = bestReps > target.hi + 2;
  if ((farBelow || farAbove) && spec.e1rm !== false) {
    const bestSetAtTop = atTop.reduce((a, b) => (b.reps > a.reps ? b : a));
    const e1 = estimate1RM(bestSetAtTop.weight, bestSetAtTop.reps);
    const aimReps = Math.round((target.lo + target.hi) / 2);
    if (e1) {
      const est = Math.max(stepUnit, clean(roundTo(e1 / (1 + aimReps / 30), stepUnit)));
      if (est !== topWeight) {
        return { ...base, action: "adjust_range", source, baseline, weight: est, targetReps: aimReps, text: `Target is ${describeTarget(target)} but last time (${when}) you did ${topWeight}${unit} for ${minReps === bestReps ? bestReps : `${minReps}-${bestReps}`}. Try about ${est}${unit} for ${aimReps} reps (estimated from that set — adjust to how it feels).${rangeNote}` };
      }
    }
  }

  return { ...base, action: "hold", source, baseline, weight: topWeight, targetReps: Math.min(minReps + 1, target.hi), text: `Stay at ${topWeight}${unit} (from ${when}). Push for ${Math.min(minReps + 1, target.hi)}+ reps on your weakest set.${rangeNote}` };
}

function firstSessionText(type, target, rangeText, fromPlan) {
  const via = fromPlan ? " (from your plan)" : "";
  if (type === "duration" || type === "isometric_hold") return `No history yet. Hold for ${rangeText}${via} with clean form and log how long you manage.`;
  if (type === "weighted_duration") return `No history yet. Pick a light load you can hold for ${rangeText}${via} and log it.`;
  if (type === "distance_duration") return "No history yet. Log a distance or time you can repeat and aim to beat it next session.";
  if (type === "weight_distance") return "No history yet. Pick a load you can move with good form and log the distance.";
  if (type === "assisted_bodyweight") return `No history yet. Choose an assistance level that lets you complete ${rangeText}${via} with good form.`;
  if (type === "reps_only" || type === "bodyweight_reps") return `No history yet. Aim for ${rangeText}${via} with good form and log what you get.`;
  return `No history yet. Pick a weight you can control for ${rangeText}${via} and log it.`;
}

/** Pre-fill for the next set's inputs: the progression target where it is a concrete number,
 *  otherwise the best qualifying set of the last session. Plain data, always editable. */
export function suggestedSetValues(progression, type) {
  if (!progression || progression.action === "start") return {};
  const b = progression.baseline || {};
  const out = {};
  if (progression.weight != null) out.weight = progression.weight;
  if (progression.assistWeight != null) out.assistWeight = progression.assistWeight;
  if (progression.targetReps != null) out.reps = progression.targetReps;
  if (progression.targetSeconds != null) out.durationSeconds = progression.targetSeconds;
  if (type === "reps_only" || type === "bodyweight_reps") out.reps = Math.min((b.bestReps ?? progression.target?.lo ?? 0), progression.target?.hi ?? Infinity) || undefined;
  return out;
}
