#!/usr/bin/env node
// Automated exercise-catalogue validator. Fails the process (non-zero exit) on any structural
// defect that would silently corrupt search, filters, readiness, or workout history. Also prints
// coverage reports and flags suspiciously low-coverage muscles/equipment. Run via `npm run
// validate:exercises`; wired into CI-equivalent verification alongside lint/typecheck/tests/build.
import {
  EXERCISES, MUSCLE_GROUPS, READINESS_MUSCLE_IDS, EQUIPMENT_TYPES, TRACKING_TYPES,
  regionForExercise, REGION_LABEL, getExerciseGuidance,
} from "../src/exerciseData.js";

const errors = [];
const warnings = [];

function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

const normalizedName = (s) => s.toLowerCase().trim().replace(/\s+/g, " ");

/* ---------------------------------------------------------------- */
/* Structural checks                                                  */
/* ---------------------------------------------------------------- */

// Duplicate IDs
{
  const seen = new Map();
  for (const ex of EXERCISES) {
    if (seen.has(ex.id)) fail(`Duplicate id "${ex.id}": ${seen.get(ex.id)} vs ${ex.name}`);
    seen.set(ex.id, ex.name);
  }
}

// Duplicate normalized canonical names
{
  const seen = new Map();
  for (const ex of EXERCISES) {
    const key = normalizedName(ex.name);
    if (seen.has(key)) fail(`Duplicate canonical name (case/whitespace-insensitive): "${seen.get(key)}" vs "${ex.name}"`);
    seen.set(key, ex.name);
  }
}

// Alias collisions: an alias must never equal another exercise's canonical name, and must never be
// claimed as an alias of more than one exercise.
{
  const canonicalSet = new Map(EXERCISES.map((e) => [normalizedName(e.name), e.name]));
  const aliasOwner = new Map();
  for (const ex of EXERCISES) {
    for (const alias of ex.aliases || []) {
      const key = normalizedName(alias);
      if (canonicalSet.has(key) && key !== normalizedName(ex.name)) {
        fail(`Alias collision: "${alias}" (alias of "${ex.name}") is also the canonical name of "${canonicalSet.get(key)}"`);
      }
      if (aliasOwner.has(key) && aliasOwner.get(key) !== ex.name) {
        fail(`Alias "${alias}" is claimed by both "${aliasOwner.get(key)}" and "${ex.name}"`);
      }
      aliasOwner.set(key, ex.name);
    }
  }
}

// Missing primary muscle / unknown muscle values / unknown equipment values
const knownMuscles = new Set(MUSCLE_GROUPS);
const knownEquipment = new Set(EQUIPMENT_TYPES);
for (const ex of EXERCISES) {
  if (!ex.muscle) fail(`"${ex.name}" has no primary muscle group`);
  else if (!knownMuscles.has(ex.muscle)) fail(`"${ex.name}" has unknown muscle group "${ex.muscle}"`);
  if (!ex.equipment) fail(`"${ex.name}" has no equipment`);
  else if (!knownEquipment.has(ex.equipment)) fail(`"${ex.name}" has unknown equipment "${ex.equipment}"`);
}

// Missing tracking types / unsupported logging types
const knownTrackingTypes = new Set(TRACKING_TYPES);
for (const ex of EXERCISES) {
  if (!ex.trackingType) fail(`"${ex.name}" has no trackingType`);
  else if (!knownTrackingTypes.has(ex.trackingType)) fail(`"${ex.name}" has unsupported trackingType "${ex.trackingType}"`);
}

// Missing readiness mappings (every exercise must resolve to a real region)
const knownRegions = new Set(READINESS_MUSCLE_IDS);
for (const ex of EXERCISES) {
  const region = regionForExercise(ex);
  if (!region) fail(`"${ex.name}" does not resolve to any readiness region`);
  else if (!knownRegions.has(region)) fail(`"${ex.name}" resolves to unknown region "${region}"`);
}

// Readiness weights outside accepted bounds — the app's readiness algorithm doesn't currently
// store a per-exercise numeric "weight," but secondaryMuscles participation is the closest
// equivalent load signal; guard against a self-referential or malformed secondary-muscle list.
for (const ex of EXERCISES) {
  const primary = regionForExercise(ex);
  for (const sec of ex.secondaryMuscles || []) {
    if (!knownRegions.has(sec)) fail(`"${ex.name}" lists unknown secondary muscle "${sec}"`);
    if (sec === primary) fail(`"${ex.name}" lists its own primary region ("${sec}") as a secondary muscle too`);
  }
  if (new Set(ex.secondaryMuscles || []).size !== (ex.secondaryMuscles || []).length) {
    fail(`"${ex.name}" has a duplicate entry within its own secondaryMuscles list`);
  }
}

// Empty instructions — every exercise must resolve to at least one non-empty instruction via its
// own override or its movement pattern's shared default (see getExerciseGuidance, exerciseData.js).
for (const ex of EXERCISES) {
  const guidance = getExerciseGuidance(ex);
  if (guidance.instructions.length === 0 || guidance.instructions.every((s) => !s || !s.trim())) {
    fail(`"${ex.name}" (pose: ${ex.pose}) resolves to empty instructions — no override and no POSE_SETUP_EXECUTION entry for this pose`);
  }
  if (guidance.formCues.length === 0) {
    warn(`"${ex.name}" (pose: ${ex.pose}) has no form cues`);
  }
}

// Broken / self-referencing alternative references. Alternatives are computed on demand
// (getExerciseAlternatives), not stored — but any exercise providing an explicit `alternatives`
// override must reference real, different exercises.
for (const ex of EXERCISES) {
  for (const altName of ex.alternatives || []) {
    if (altName === ex.name) fail(`"${ex.name}" lists itself as its own alternative`);
    else if (!EXERCISES.some((e) => e.name === altName)) fail(`"${ex.name}" lists a nonexistent alternative "${altName}"`);
  }
}

// Deprecated exercises without replacements
for (const ex of EXERCISES) {
  if (ex.deprecated && !(ex.alternatives && ex.alternatives.length > 0)) {
    fail(`"${ex.name}" is marked deprecated but lists no replacement in \`alternatives\``);
  }
}

// Unsupported / missing mediaStatus
for (const ex of EXERCISES) {
  if (ex.mediaStatus !== "approved" && ex.mediaStatus !== "pending" && ex.mediaStatus !== "unavailable") {
    fail(`"${ex.name}" has invalid mediaStatus "${ex.mediaStatus}"`);
  }
}

// Exercises unreachable through search — every exercise must be findable by searching its own full
// canonical name (a weaker, cheaper proxy for matchesExerciseSearch, re-implemented locally to
// avoid importing React-bearing App.jsx into this Node script).
for (const ex of EXERCISES) {
  const terms = ex.name.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = ex.name.toLowerCase();
  const reachable = terms.every((t) => haystack.includes(t));
  if (!reachable) fail(`"${ex.name}" is not reachable by searching its own name (should never happen)`);
}

// Triceps must never be reachable only through Chest or Shoulders — the confirmed high-priority
// regression this expansion exists to fix. Checks both the primary-region mapping AND that no
// triceps-named/triceps-family exercise's *only* muscle-group tag is chest/shoulders in a way that
// would hide it from an "arms" or region-level Triceps filter.
{
  const tricepsExercises = EXERCISES.filter((ex) => regionForExercise(ex) === "triceps");
  if (tricepsExercises.length === 0) fail("No exercises map to the triceps region at all");
  for (const ex of tricepsExercises) {
    if (ex.muscle === "chest" || ex.muscle === "shoulders") {
      fail(`"${ex.name}" resolves to the triceps region but is filed under muscle group "${ex.muscle}" — it would never surface under an Arms filter`);
    }
  }
  const REQUIRED_TRICEPS = [
    "Close Grip Bench Press", "JM Press", "Skull Crusher", "EZ-Bar Skull Crusher", "Dumbbell Skull Crusher",
    "Rolling Dumbbell Triceps Extension", "Tate Press", "Dumbbell Overhead Extension", "Single Arm Overhead Extension",
    "Overhead Cable Triceps Extension", "Overhead Rope Extension", "Single-Arm Cable Overhead Triceps Extension",
    "Rope Pushdown", "Straight Bar Pushdown", "V-Bar Pushdown", "Reverse Grip Pushdown", "Single Arm Pushdown",
    "Cross Body Cable Extension", "Cable Triceps Kickback", "Dumbbell Triceps Kickback", "Parallel Bar Dips",
    "Assisted Dip Machine", "Plate Loaded Dip Machine", "Bench Dips", "Diamond Push-Up", "Close-Grip Push-Up",
    "Triceps Extension Machine",
  ];
  for (const name of REQUIRED_TRICEPS) {
    const ex = EXERCISES.find((e) => e.name === name);
    if (!ex) fail(`Required triceps exercise "${name}" is missing from the catalogue`);
    else if (regionForExercise(ex) !== "triceps") fail(`Required triceps exercise "${name}" does not resolve to the triceps region`);
  }
}

/* ---------------------------------------------------------------- */
/* Coverage reports                                                    */
/* ---------------------------------------------------------------- */

function countBy(fn) {
  const counts = {};
  for (const ex of EXERCISES) {
    const key = fn(ex);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

const coverage = {
  byPrimaryMuscleRegion: countBy((ex) => regionForExercise(ex) || "(none)"),
  bySecondaryMuscle: (() => {
    const counts = {};
    for (const ex of EXERCISES) for (const sec of ex.secondaryMuscles || []) counts[sec] = (counts[sec] || 0) + 1;
    return counts;
  })(),
  byEquipment: countBy((ex) => ex.equipment),
  byMovementPattern: countBy((ex) => ex.pose),
  byTrackingType: countBy((ex) => ex.trackingType),
  byDifficulty: countBy((ex) => ex.difficulty),
  byMechanics: countBy((ex) => ex.mechanics),
  byMediaStatus: countBy((ex) => ex.mediaStatus),
};

const LOW_COVERAGE_THRESHOLD = 3;
for (const region of READINESS_MUSCLE_IDS) {
  const n = coverage.byPrimaryMuscleRegion[region] || 0;
  if (n === 0) fail(`Region "${REGION_LABEL[region] || region}" has ZERO exercises mapped to it`);
  else if (n < LOW_COVERAGE_THRESHOLD) warn(`Region "${REGION_LABEL[region] || region}" has suspiciously low coverage: only ${n} exercise(s)`);
}

/* ---------------------------------------------------------------- */
/* Report                                                              */
/* ---------------------------------------------------------------- */

console.log(`Exercise Library Validation — ${EXERCISES.length} exercises\n`);
console.log("=== Coverage by primary muscle region ===");
console.table(coverage.byPrimaryMuscleRegion);
console.log("=== Coverage by secondary muscle ===");
console.table(coverage.bySecondaryMuscle);
console.log("=== Coverage by equipment ===");
console.table(coverage.byEquipment);
console.log("=== Coverage by movement pattern ===");
console.table(coverage.byMovementPattern);
console.log("=== Coverage by tracking type ===");
console.table(coverage.byTrackingType);
console.log("=== Coverage by difficulty ===");
console.table(coverage.byDifficulty);
console.log("=== Coverage by mechanics (compound/isolation) ===");
console.table(coverage.byMechanics);
console.log("=== Coverage by media status ===");
console.table(coverage.byMediaStatus);

if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} warning(s):`);
  warnings.forEach((w) => console.log("  -", w));
}

if (errors.length) {
  console.log(`\n✗ ${errors.length} error(s):`);
  errors.forEach((e) => console.log("  -", e));
  console.log("\nFAILED");
  process.exit(1);
} else {
  console.log(`\n✓ Passed — ${EXERCISES.length} exercises, 0 errors, ${warnings.length} warning(s)`);
}
