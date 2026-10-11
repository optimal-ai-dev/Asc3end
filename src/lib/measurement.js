// Explicit measurement model for logged sets. One table defines, per tracking type, which fields
// a set carries, which are required, what they mean, and which derived numbers (volume, estimated
// 1RM, the "best" value used for PRs) are legitimate for it. Everything that reads or writes a
// set — the logger, history, correction form, PRs, charts, volume, exports, coach context and
// progression — goes through this module, so a plank can never grow a "kg ×" or an "estimated
// 1RM" in one screen while another shows it correctly.
//
// Pure data in / plain data out. No React, no storage, no catalogue import (callers resolve the
// type; see exerciseLookup.js), so it is safe to import from server code too.

export const MEASUREMENT_TYPES = [
  "weight_reps", "bodyweight_reps", "bodyweight_plus_weight", "assisted_bodyweight",
  "reps_only", "duration", "isometric_hold", "distance_duration", "weight_distance",
  "weighted_duration", "per_side_weight",
];

// Field semantics. `exclusiveMin` means a value of exactly `min` is rejected (a 0 kg working set
// is not a working set); fields that may legitimately be zero set `min: 0` without it.
export const FIELDS = {
  weight:          { label: "Weight",     unit: "kg", min: 0, exclusiveMin: true, max: 1500, decimals: 2 },
  addedWeight:     { label: "Added weight", unit: "kg", min: 0, max: 500, decimals: 2 },
  assistWeight:    { label: "Assistance", unit: "kg", min: 0, max: 500, decimals: 2 },
  reps:            { label: "Reps",       unit: "",   min: 1, max: 500, integer: true },
  durationSeconds: { label: "Time",       unit: "s",  min: 1, max: 86400, integer: true },
  distanceMeters:  { label: "Distance",   unit: "m",  min: 0, exclusiveMin: true, max: 1000000, decimals: 1 },
  rpe:             { label: "RPE",        unit: "",   min: 1, max: 10, decimals: 1, half: true },
  rir:             { label: "RIR",        unit: "",   min: 0, max: 10, integer: true },
};

// For each type: the stored fields in display order, which must be present and valid, which are
// optional (blank means 0/absent, an explicit 0 is legitimate), and which derived metrics apply.
//   best:   the ordered comparison used for PRs; "min" fields are better when smaller.
//   volume: "load" = weight × reps tonnage; otherwise there is no tonnage for this type.
//   e1rm:   whether an estimated one-rep-max is meaningful (never for time/distance/assisted).
export const MEASUREMENT_SPEC = {
  weight_reps:            { fields: ["weight", "reps"], required: ["weight", "reps"], volume: "load", e1rm: true,  best: [["weight", "max"], ["reps", "max"]] },
  per_side_weight:        { fields: ["weight", "reps"], required: ["weight", "reps"], volume: "load", e1rm: true,  best: [["weight", "max"], ["reps", "max"]] },
  bodyweight_plus_weight: { fields: ["reps", "weight"], required: ["reps"], optional: ["weight"], optionalSpec: { weight: "addedWeight" }, volume: "load", e1rm: false, best: [["weight", "max"], ["reps", "max"]] },
  bodyweight_reps:        { fields: ["reps", "weight"], required: ["reps"], optional: ["weight"], optionalSpec: { weight: "addedWeight" }, volume: null, e1rm: false, best: [["reps", "max"], ["weight", "max"]] },
  assisted_bodyweight:    { fields: ["reps", "assistWeight"], required: ["reps"], optional: ["assistWeight"], volume: null, e1rm: false, best: [["assistWeight", "min"], ["reps", "max"]] },
  reps_only:              { fields: ["reps"], required: ["reps"], volume: null, e1rm: false, best: [["reps", "max"]] },
  duration:               { fields: ["durationSeconds"], required: ["durationSeconds"], volume: null, e1rm: false, best: [["durationSeconds", "max"]] },
  isometric_hold:         { fields: ["durationSeconds"], required: ["durationSeconds"], volume: null, e1rm: false, best: [["durationSeconds", "max"]] },
  weighted_duration:      { fields: ["weight", "durationSeconds"], required: ["weight", "durationSeconds"], volume: null, e1rm: false, best: [["weight", "max"], ["durationSeconds", "max"]] },
  distance_duration:      { fields: ["distanceMeters", "durationSeconds"], required: [], atLeastOneOf: ["distanceMeters", "durationSeconds"], volume: null, e1rm: false, best: [["distanceMeters", "max"], ["durationSeconds", "max"]] },
  weight_distance:        { fields: ["weight", "distanceMeters", "durationSeconds"], required: ["weight"], atLeastOneOf: ["distanceMeters", "durationSeconds"], volume: null, e1rm: false, best: [["weight", "max"], ["distanceMeters", "max"]] },
};

export function specFor(type) {
  return MEASUREMENT_SPEC[type] || MEASUREMENT_SPEC.weight_reps;
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isBlank = (v) => v === "" || v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Parses user input. Accepts numbers and plain decimal strings ("82.5", "82,5"); rejects
 *  exponent notation, hex, units, thousands separators and anything else a typo could produce. */
export function parseNumericInput(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw !== "string") return NaN;
  const s = raw.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

function decimalsOf(n) {
  const s = String(n);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

function checkField(name, specName, value) {
  const f = FIELDS[specName || name];
  const label = f.label;
  if (value < 0) return `${label} can't be negative.`;
  if (f.integer && !Number.isInteger(value)) return `${label} must be a whole number.`;
  if (f.half && !Number.isInteger(value * 2)) return `${label} must be a whole or half number.`;
  if (!f.integer && !f.half && f.decimals != null && decimalsOf(value) > f.decimals) return `${label} can have at most ${f.decimals} decimal place${f.decimals === 1 ? "" : "s"}.`;
  if (f.exclusiveMin ? value <= f.min : value < f.min) return f.exclusiveMin ? `${label} must be above ${f.min}.` : `${label} must be at least ${f.min}.`;
  if (value > f.max) return `${label} looks too large (max ${f.max}${f.unit ? ` ${f.unit}` : ""}).`;
  return null;
}

/**
 * Validates raw form input for one set of the given measurement type and, if valid, returns the
 * exact persisted shape. A blank *optional* field means 0 (or absent); a typed 0 is kept as a
 * legitimate zero. Required fields must be present and pass their field rule.
 * @returns {{ ok: boolean, set?: object, errors: Record<string,string> }}
 */
export function validateSetInput(type, raw = {}) {
  const spec = specFor(type);
  const errors = {};
  const out = {};

  for (const name of spec.fields) {
    const required = spec.required.includes(name);
    const optional = (spec.optional || []).includes(name);
    const specName = spec.optionalSpec?.[name];
    const value = raw[name];
    if (isBlank(value)) {
      if (required) errors[name] = `${FIELDS[name].label} is required.`;
      else if (optional) out[name] = 0;
      else out[name] = null;
      continue;
    }
    const n = parseNumericInput(value);
    if (!Number.isFinite(n)) { errors[name] = `${FIELDS[name].label} must be a number.`; continue; }
    const problem = checkField(name, specName, n);
    if (problem) errors[name] = problem;
    else out[name] = n;
  }

  if (spec.atLeastOneOf && !spec.atLeastOneOf.some((k) => isNum(out[k]) && out[k] > 0) && !Object.keys(errors).some((k) => spec.atLeastOneOf.includes(k))) {
    errors[spec.atLeastOneOf[0]] = spec.atLeastOneOf.length === 2 ? "Enter a distance or a time." : `Enter ${FIELDS[spec.atLeastOneOf[0]].label.toLowerCase()}.`;
  }

  for (const extra of ["rpe", "rir"]) {
    if (!isBlank(raw[extra])) {
      const n = parseNumericInput(raw[extra]);
      if (!Number.isFinite(n)) errors[extra] = `${FIELDS[extra].label} must be a number.`;
      else {
        const problem = checkField(extra, null, n);
        if (problem) errors[extra] = problem;
        else out[extra] = n;
      }
    }
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, set: out, errors: {} };
}

/** Does a *stored* set carry valid data for its type? Tolerant of legacy shapes (a set written
 *  before the type system existed is just { weight, reps }). Never throws on garbage. */
export function isSetComplete(set, type) {
  if (!set || typeof set !== "object") return false;
  const spec = specFor(type);
  for (const name of spec.required) {
    if (!isNum(set[name])) return false;
    const f = FIELDS[spec.optionalSpec?.[name] || name];
    if (f.exclusiveMin ? set[name] <= f.min : set[name] < f.min) return false;
  }
  for (const name of spec.optional || []) {
    if (set[name] !== undefined && set[name] !== null && !(isNum(set[name]) && set[name] >= 0)) return false;
  }
  if (spec.atLeastOneOf && !spec.atLeastOneOf.some((k) => isNum(set[k]) && set[k] > 0)) return false;
  return true;
}

/** Which field set does this stored set actually have? Used to avoid reinterpreting legacy data. */
export function inferTypeFromShape(set) {
  if (!set || typeof set !== "object") return "weight_reps";
  const has = (k) => isNum(set[k]);
  // A weight that is present but not a finite number (NaN, a string) is a corrupt weight x reps
  // record, not a reps-only one — it must stay invalid rather than be re-read as something valid.
  if (set.weight !== undefined && set.weight !== null && !has("weight")) return "weight_reps";
  if (has("assistWeight")) return "assisted_bodyweight";
  if (has("distanceMeters") && has("weight")) return "weight_distance";
  if (has("distanceMeters")) return "distance_duration";
  if (has("durationSeconds") && has("weight") && set.weight > 0) return "weighted_duration";
  if (has("durationSeconds") && !has("reps")) return "duration";
  if (has("reps") && has("weight") && set.weight > 0) return "weight_reps";
  if (has("reps") && (!has("weight") || set.weight === 0)) return "reps_only";
  return "weight_reps";
}

/**
 * The type a logged exercise entry should be read as. Priority:
 *   1. the type persisted on the entry itself (new records) — authoritative;
 *   2. the catalogue/custom exercise type, but only if the entry's sets are actually compatible
 *      with it (a legacy {weight, reps} record for an exercise since re-classified as a timed
 *      hold must keep reading as weight × reps — never silently reinterpreted);
 *   3. the shape of the sets themselves.
 */
export function effectiveTrackingType(entry, catalogueType) {
  if (entry?.trackingType && MEASUREMENT_SPEC[entry.trackingType]) return entry.trackingType;
  const sets = (entry?.sets || []).filter((s) => s && typeof s === "object");
  if (catalogueType && MEASUREMENT_SPEC[catalogueType]) {
    if (sets.length === 0 || sets.every((s) => isSetShapeCompatible(s, catalogueType))) return catalogueType;
  }
  if (sets.length === 0) return catalogueType || "weight_reps";
  // Most common shape across the entry's sets (ties go to the first), so one corrupt set cannot
  // decide how the rest of the entry is read.
  const counts = new Map();
  for (const s of sets) {
    const t = inferTypeFromShape(s);
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  let winner = null;
  for (const [t, n] of counts) if (!winner || n > counts.get(winner)) winner = t;
  return winner;
}

function isSetShapeCompatible(set, type) {
  const spec = specFor(type);
  const hasAny = spec.fields.some((k) => set[k] !== undefined && set[k] !== null);
  if (!hasAny) return false;
  // Every field the set DOES carry must be one this type knows about, and the type's required
  // fields must exist (their values may still be invalid — that is isSetComplete's job).
  const known = new Set([...spec.fields, "type", "rpe", "rir", "note", "id", "completedAt", "planned"]);
  if (!Object.keys(set).every((k) => known.has(k) || set[k] === undefined || set[k] === null)) return false;
  return spec.required.every((k) => set[k] !== undefined && set[k] !== null) && (!spec.atLeastOneOf || spec.atLeastOneOf.some((k) => set[k] != null));
}

/* ---------------------------- derived numbers --------------------------- */

/** Epley. Meaningful only for low-to-moderate rep sets, so reps > 30 yields null, not noise. */
export function estimate1RM(weight, reps) {
  if (!isNum(weight) || !isNum(reps) || weight <= 0 || reps < 1 || reps > 30) return null;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

/** Tonnage (weight × reps as logged). Null — not 0, not NaN — where tonnage has no meaning. */
export function setVolume(set, type) {
  const spec = specFor(type);
  if (spec.volume !== "load" || !isSetComplete(set, type)) return null;
  const w = isNum(set.weight) ? set.weight : 0;
  return w * set.reps;
}

export function setEstimated1RM(set, type) {
  if (!specFor(type).e1rm || !isSetComplete(set, type)) return null;
  return estimate1RM(set.weight, set.reps);
}

/** Positive if a is a better performance than b for this type (used for PRs and "top set"). */
export function compareSets(a, b, type) {
  for (const [field, dir] of specFor(type).best) {
    const av = isNum(a?.[field]) ? a[field] : (dir === "min" ? Infinity : 0);
    const bv = isNum(b?.[field]) ? b[field] : (dir === "min" ? Infinity : 0);
    if (av === bv) continue;
    return dir === "min" ? bv - av : av - bv;
  }
  return 0;
}

export function bestSet(sets, type) {
  const valid = (sets || []).filter((s) => isSetComplete(s, type));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => (compareSets(b, a, type) > 0 ? b : a));
}

/* ----------------------------- set kinds -------------------------------- */
// How a set counts toward different calculations. Unknown/absent/legacy values ("working",
// "normal", undefined) are ordinary working sets — old records must keep their meaning.
export const SET_KINDS = ["normal", "warmup", "drop", "failure", "deload"];

export function setKind(set) {
  const t = set?.type;
  if (t === "warmup" || t === "drop" || t === "failure" || t === "deload") return t;
  return "normal";
}

export const SET_KIND_RULES = {
  //            baseline  workload  pr
  normal:  { baseline: true,  workload: 1,   pr: true  },
  failure: { baseline: true,  workload: 1,   pr: true  },
  drop:    { baseline: false, workload: 1,   pr: false },
  deload:  { baseline: false, workload: 0.5, pr: false },
  warmup:  { baseline: false, workload: 0,   pr: false },
};

export const isBaselineEligible = (set) => SET_KIND_RULES[setKind(set)].baseline;
export const isPrEligible = (set) => SET_KIND_RULES[setKind(set)].pr;
export const isWorkingSet = (set) => SET_KIND_RULES[setKind(set)].workload > 0;

/* ------------------------------ formatting ------------------------------ */

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${s}s`;
}

export function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)}km` : `${meters}m`;
}

const num = (v) => (isNum(v) ? v : null);

/** One-line, unit-correct summary of a stored set. Never prints undefined/NaN or a unit the type
 *  does not use; a set that is missing a field its type needs renders an honest "—". */
export function formatSet(set, type = "weight_reps", { unit = "kg" } = {}) {
  if (!set || typeof set !== "object") return "—";
  const w = num(set.weight), r = num(set.reps), d = num(set.durationSeconds), m = num(set.distanceMeters), a = num(set.assistWeight);
  switch (type) {
    case "bodyweight_reps":
      if (r == null) return "—";
      return w ? `BW+${w}${unit} × ${r}` : `${r} reps (bodyweight)`;
    case "bodyweight_plus_weight":
      if (r == null) return "—";
      return w ? `BW+${w}${unit} × ${r}` : `${r} reps (bodyweight)`;
    case "assisted_bodyweight":
      return r == null ? "—" : `${r} reps (${a || 0}${unit} assist)`;
    case "reps_only":
      return r == null ? "—" : `${r} reps`;
    case "duration":
    case "isometric_hold":
      return d == null ? "—" : formatDuration(d);
    case "distance_duration":
      return [m ? formatDistance(m) : null, d ? formatDuration(d) : null].filter(Boolean).join(" / ") || "—";
    case "weight_distance":
      return w == null ? "—" : [`${w}${unit}`, m ? formatDistance(m) : null, d ? formatDuration(d) : null].filter(Boolean).join(" · ");
    case "weighted_duration":
      return w == null || d == null ? "—" : `${w}${unit} × ${formatDuration(d)}`;
    default:
      return w == null || r == null ? "—" : `${w}${unit} × ${r}`;
  }
}

/** Short label for the weight an input/summary refers to — states the basis so "20" is never
 *  ambiguous between "each dumbbell" and "the total on the bar". */
export function weightBasisLabel({ equipment, laterality, trackingType } = {}) {
  if (trackingType === "assisted_bodyweight") return "assistance (kg)";
  if (trackingType === "bodyweight_reps" || trackingType === "bodyweight_plus_weight") return "added kg";
  if (trackingType === "per_side_weight" || laterality === "unilateral" || laterality === "alternating") return "kg (each side)";
  if (equipment === "Dumbbell") return "kg (each dumbbell)";
  if (equipment === "Kettlebell") return "kg (each kettlebell)";
  return "kg";
}

/* ------------------------- exercise-level helpers ------------------------ */

/** Sets that carry real, valid data for the entry's measurement type (any set kind). */
export function completeSets(entry, type) {
  return (entry?.sets || []).filter((s) => isSetComplete(s, type));
}

export function exerciseVolume(entry, type) {
  return completeSets(entry, type).reduce((n, s) => n + (setVolume(s, type) || 0), 0);
}

/** Total tonnage across a workout; each exercise is read through its own measurement type. */
export function workoutTonnage(workout, typeOf) {
  return (workout?.exercises || []).reduce((n, e) => n + exerciseVolume(e, effectiveTrackingType(e, typeOf?.(e.name))), 0);
}

/** One-line description of an exercise's logged performance, e.g. for history rows. */
export function summarizeExercise(entry, type, opts) {
  const sets = completeSets(entry, type);
  if (sets.length === 0) return "No sets logged";
  const b = bestSet(sets, type);
  return `${sets.length} set${sets.length === 1 ? "" : "s"} · best ${formatSet(b, type, opts)}`;
}
