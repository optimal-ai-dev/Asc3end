import {
  EXERCISES, MUSCLE_GROUPS, MUSCLE_REGIONS, READINESS_MUSCLE_IDS, regionForExercise, SECONDARY_REGIONS_BY_POSE
} from "../exerciseData";

export const SET_TYPES = ["normal", "warmup", "drop", "failure"];
export const SET_TYPE_LABELS = { normal: "Normal", warmup: "Warm-up", drop: "Drop Set", failure: "Failure" };
export const SET_TYPE_COLORS = { normal: "#86A296", warmup: "#FFA53D", drop: "#4F9DFF", failure: "#FF6B81" };

export const GOAL_LABELS = {
  muscle_growth: "Build Muscle",
  strength: "Get Stronger",
  fat_loss: "Lose Fat",
  general: "General Fitness",
};

// Order-independent, per-word substring search — every word in the query must appear somewhere
// in the name, but not necessarily contiguously or in the order typed. A plain single-substring
// check (name.includes(query)) fails the moment someone searches "dumbbell press incline" against
// "Incline Dumbbell Press": the words are all there, just not in that exact contiguous order,
// which is exactly the bug this was written to fix — a real user reported "incline dumbbell
// press" finding nothing despite that exact exercise existing.
/** Human-readable summary of one logged set, in whatever unit its tracking type actually uses —
 *  never assumes weight×reps. Used everywhere a set needs to render as a single line (active
 *  workout, workout history, workout detail modal). */
export function formatSet(set, trackingType = "weight_reps") {
  const fmtDur = (s) => { const m = Math.floor(s / 60), sec = s % 60; return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${s}s`; };
  const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)}km` : `${m}m`);
  switch (trackingType) {
    case "bodyweight_reps":
      return set.weight ? `BW+${set.weight}kg × ${set.reps}` : `${set.reps} reps (bodyweight)`;
    case "assisted_bodyweight":
      return `${set.reps} reps (${set.assistWeight || 0}kg assist)`;
    case "reps_only":
      return `${set.reps} reps`;
    case "duration":
    case "isometric_hold":
      return fmtDur(set.durationSeconds || 0);
    case "distance_duration":
      return [set.distanceMeters ? fmtDist(set.distanceMeters) : null, set.durationSeconds ? fmtDur(set.durationSeconds) : null].filter(Boolean).join(" / ") || "—";
    case "weight_distance":
      return [`${set.weight}kg`, set.distanceMeters ? fmtDist(set.distanceMeters) : null, set.durationSeconds ? fmtDur(set.durationSeconds) : null].filter(Boolean).join(" · ");
    case "weighted_duration":
      return `${set.weight}kg × ${fmtDur(set.durationSeconds || 0)}`;
    default:
      return `${set.weight}kg × ${set.reps}`;
  }
}

export function matchesSearch(name, query) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const lowerName = name.toLowerCase();
  return terms.every((term) => lowerName.includes(term));
}

/* Matches an AI-generated exercise name against the real exercise library, exact first then fuzzy,
   so exercises the coach suggests can link to real form cues and pose demonstrations. */
export function lookupExercise(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  const exact = EXERCISES.find((e) => e.name.toLowerCase() === lower);
  if (exact) return exact;
  const fuzzy = EXERCISES.find((e) => e.name.toLowerCase().includes(lower) || lower.includes(e.name.toLowerCase()));
  return fuzzy || null;
}

export function muscleRecovery(workouts, customExercises = []) {
  const now = Date.now();
  const status = {};
  MUSCLE_GROUPS.forEach((m) => (status[m] = { hours: Infinity, lastDate: null, recentSets: 0, recentSessions: 0 }));
  const allEx = [...EXERCISES, ...customExercises];
  workouts.forEach((w) => {
    const t = new Date(w.date).getTime();
    const hrs = (now - t) / 3600000;
    const hitThisWorkout = new Set();
    w.exercises.forEach((e) => {
      const ex = allEx.find((x) => x.name === e.name);
      if (!ex) return;
      if (hrs < status[ex.muscle].hours) { status[ex.muscle].hours = hrs; status[ex.muscle].lastDate = w.date; }
      // "Recent" = last 7 days, used to show actual training load rather than just a single last-session snapshot.
      if (hrs <= 168) { status[ex.muscle].recentSets += e.sets.length; hitThisWorkout.add(ex.muscle); }
    });
    hitThisWorkout.forEach((m) => status[m].recentSessions++);
  });
  Object.keys(status).forEach((m) => {
    const h = status[m].hours;
    status[m].level = h < 24 ? "rest" : h < 48 ? "partial" : "ready";
    // Rough estimate only — real recovery time varies by muscle, volume, intensity, sleep, and individual factors.
    status[m].hoursUntilReady = Number.isFinite(h) ? Math.max(0, Math.round(48 - h)) : 0;
  });
  return status;
}

// Replaces the earlier 15-dot MuscleMap15 system with 17 genuine anatomical SVG regions (chest,
// front/side/rear delts, biceps, triceps, forearms, abs, obliques, traps, upper back, lats,
// lower back, glutes, quads, hamstrings, calves), each independently selectable and colored by
// Asc3end's own recovery estimate for that specific region — not a second calculation system,
// just finer granularity on the same trusted "hours since last set, sets in the last 7 days"
// algorithm the app has always used (previously only exposed at 6-group granularity).
//
// Finer granularity comes from each exercise's existing `pose` field (already used elsewhere —
// ExerciseFigure illustrations, coaching cues — not new data invented for this feature): a Curl
// trains biceps, a Lateral Raise trains side delts, a Leg Curl trains hamstrings, etc. See
// POSE_TO_REGION below. A region with zero matching logged sets ever reports level "unknown" —
// it is never given a color by silently borrowing its parent group's status.

export const READINESS_COLORS = {
  ready: "var(--readiness-ready)",
  partial: "var(--readiness-partial)",
  fatigued: "var(--readiness-fatigued)",
  unknown: "var(--readiness-unknown)",
};
export const READINESS_LABEL = {
  ready: "Ready", partial: "Partially recovered", fatigued: "Fatigued", unknown: "Insufficient data",
};

// MUSCLE_REGIONS, READINESS_DISPLAY_SOURCE, POSE_TO_REGION, GROUP_DEFAULT_REGION and
// regionForExercise now live in ./exerciseData.js (imported above), extended there to cover every
// pose this expansion introduces. UNMAPPED_READINESS_REGIONS (abductors, tibialis anterior, hip
// flexors) are real, independently-computed readiness regions with real exercise data behind them
// — they're just not drawn on this SVG figure yet (see the final report for why).

/* The same recovery estimate Asc3end has always used, applied per-region instead of per-group.
   Handles every edge case by construction, not by special-casing: a deleted or edited workout is
   simply absent from (or different in) the `workouts` array the next time this runs — there is
   no separate cache to go stale. Multiple sessions on one day both contribute to that day's
   recentSets normally. A rest day just means no workout matches that date. A brand-new account
   (or a region nothing has ever trained) reports "unknown", never a fabricated percentage.

   Secondary load: a pressing or dip-pattern exercise genuinely does stimulate the triceps even
   when its primary region is chest or front delts — SECONDARY_REGIONS_BY_POSE (exerciseData.js)
   says which regions that is, per movement pattern. Secondary regions get their recency (`hours`/
   `lastDate`) updated, so triceps correctly shows more fatigued after a heavy bench session — but
   NOT their `recentSets`/`recentSessions` count, which stays reserved for direct work on that
   region. This is a deliberate distinction: it answers "when did this muscle last do *something*"
   honestly for both primary and secondary stimulus, without double-counting training volume that
   was never actually triceps-focused sets. */
export function muscleReadiness(workouts, customExercises = []) {
  const now = Date.now();
  const status = {};
  READINESS_MUSCLE_IDS.forEach((id) => (status[id] = { hours: Infinity, lastDate: null, recentSets: 0, recentSessions: 0 }));
  const allEx = [...EXERCISES, ...customExercises];
  (workouts || []).forEach((w) => {
    const t = new Date(w.date).getTime();
    const hrs = (now - t) / 3600000;
    const hitThisWorkout = new Set();
    (w.exercises || []).forEach((e) => {
      const ex = allEx.find((x) => x.name === e.name);
      const regionId = regionForExercise(ex);
      if (!regionId) return;
      const s = status[regionId];
      if (hrs < s.hours) { s.hours = hrs; s.lastDate = w.date; }
      // "Recent" = last 7 days, same window muscleRecovery always used.
      if (hrs <= 168) { s.recentSets += (e.sets || []).length; hitThisWorkout.add(regionId); }
      (SECONDARY_REGIONS_BY_POSE[ex?.pose] || []).forEach((secId) => {
        const secStatus = status[secId];
        if (secStatus && hrs < secStatus.hours) { secStatus.hours = hrs; secStatus.lastDate = w.date; }
      });
    });
    hitThisWorkout.forEach((r) => status[r].recentSessions++);
  });
  Object.keys(status).forEach((r) => {
    const s = status[r];
    const h = s.hours;
    s.level = !Number.isFinite(h) ? "unknown" : h < 24 ? "fatigued" : h < 48 ? "partial" : "ready";
    // Rough estimate only — real recovery time varies by muscle, volume, intensity, sleep, and
    // individual factors. Both figures below are two views of the exact same h-vs-48h ratio, so
    // they can never disagree with each other or with `level`.
    s.hoursUntilReady = Number.isFinite(h) ? Math.max(0, Math.round(48 - h)) : null;
    s.recoveryPercent = Number.isFinite(h) ? Math.max(0, Math.min(100, Math.round((h / 48) * 100))) : null;
  });
  return status;
}

// Collapses per-region readiness (muscleReadiness above) into one level per coarse muscle group,
// for the compact Recovery summary on Home. A group takes its most-fatigued region that has data,
// so "legs: ready" is never shown while the hamstrings are still fatigued; a group with no data
// in any region is "unknown".
const READINESS_RANK = { fatigued: 3, partial: 2, ready: 1 };
export function readinessByGroup(readiness) {
  const groups = {};
  MUSCLE_REGIONS.forEach((r) => {
    const level = readiness?.[r.id]?.level || "unknown";
    const cur = groups[r.group] || "unknown";
    if ((READINESS_RANK[level] || 0) > (READINESS_RANK[cur] || 0)) groups[r.group] = level;
    else if (!groups[r.group]) groups[r.group] = cur;
  });
  return groups;
}

export function workoutVolume(workout) {
  return (workout.exercises || []).reduce((s, e) => s + (e.sets || []).reduce((s2, st) => s2 + (Number.isFinite(st.weight) && Number.isFinite(st.reps) ? st.weight * st.reps : 0), 0), 0);
}
