// Name -> exercise resolution shared by the app, Progress and the server-side coach context.
// `name` is the persisted identity of an exercise (see the stability contract in exerciseData.js);
// `id` is the catalogue's stable slug and is what the coach and exports expose alongside it.

import { EXERCISES } from "../exerciseData.js";

const BY_NAME = new Map();
const BY_ALIAS = new Map();
for (const ex of EXERCISES) {
  BY_NAME.set(ex.name.toLowerCase(), ex);
  for (const alias of ex.aliases || []) {
    const key = alias.toLowerCase();
    if (!BY_ALIAS.has(key) && !BY_NAME.has(key)) BY_ALIAS.set(key, ex);
  }
}

/** Exact name first, then a custom exercise, then an alias of a built-in. Never fuzzy. */
export function findExercise(name, customExercises = []) {
  if (typeof name !== "string") return null;
  const key = name.toLowerCase().trim();
  return (
    BY_NAME.get(key) ||
    (customExercises || []).find((c) => c?.name?.toLowerCase().trim() === key) ||
    BY_ALIAS.get(key) ||
    null
  );
}

export function resolveTrackingType(name, customExercises = []) {
  return findExercise(name, customExercises)?.trackingType || null;
}

/** Stable identifier: catalogue slug for built-ins, "custom:<slug>" for a user's own exercise,
 *  null for a name that matches nothing (e.g. an AI-suggested exercise logged by hand). */
export function exerciseId(name, customExercises = []) {
  const ex = findExercise(name, customExercises);
  if (!ex) return null;
  if (ex.isCustom) return `custom:${String(ex.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
  return ex.id || null;
}
